import {IHttp, IHttpRequest, ILogger, IPersistence, IRead} from '@rocket.chat/apps-engine/definition/accessors';
import * as url from 'url';
import {SlacklineApp} from '../SlacklineApp';
import {SlacklineStorage} from './SlacklineStorage';

export class SlackAPIClient {
    public static async asyncConstruct(app: SlacklineApp, token?: string): Promise<SlackAPIClient> {
        const clientID = await app.getAccessors().environmentReader.getSettings().getValueById('slack_client_id');
        const cSecret = await app.getAccessors().environmentReader.getSettings().getValueById('slack_client_secret');
        return new SlackAPIClient(app, clientID, cSecret, token);
    }

    private readonly clientID: string;
    private readonly cSecret: string;
    private readonly app: SlacklineApp;
    private apiCache: Array<IApiCache> = Array<IApiCache>();

    private logger: ILogger;
    private http: IHttp;
    private token?: string;
    private baseURL = 'https://slack.com/api/';
    private headers = { 'Content-type': 'application/x-www-form-urlencoded'};

    constructor(app: SlacklineApp, clientId: string, clientSecret: string, token?: string)  {
        this.http = app.getAccessors().http;
        this.logger = app.getLogger();
        this.token = token;
        this.clientID = clientId;
        this.cSecret = clientSecret;
        this.app = app;
    }

    public async userInfo(userId: string): Promise<ISlackUserInfo> {
        const result = await this.callApi('users.info', {user: userId});
        return {
            userId: result.user.id,
            name: result.user.name,
            displayName: result.user.real_name,
        };
    }

    public async myInfo(): Promise<ISlackUserInfo> {
        const result = await this.callApi('auth.test', {});
        const useriId = result.user_id;
        return await this.userInfo(useriId);
    }

    public async channelMembers(channelId: string): Promise<Array<ISlackUserInfo>> {
        const result = await this.callApi('conversations.members', {channel: channelId});
        if (result.members) {
            return Promise.all((result.members as Array<string>).map((userId) => {
                return this.userInfo(userId);
            }));
        } else {
            return [];
        }
    }

    public async currentUserChannels(): Promise<Array<ISlackChannel>> {
        const result = await this.callApi('conversations.list', {
            types: 'private_channel,mpim,im',
        });
        const channels: [ISlackChannel] = result.channels.map((channel): ISlackChannel => {
            return {
                channelId: channel.id,
                is_channel: channel.is_group,
                is_im: channel.is_im,
                is_mpim: channel.is_mpim,
                otherUser: channel.user,
                name: channel.name,
                creator: channel.creator,
                normalized_name: channel.name_normalized,
            };
        });

        return Promise.all(channels.map(async (channel) => {
            if (channel.otherUser) {
                channel.userInfo = await this.userInfo(channel.otherUser);
            } else if (channel.is_mpim || channel.is_channel) {
                channel.userInfo = await this.channelMembers(channel.channelId);
            }
            return Promise.resolve(channel);
        }));
    }

    public async allWorkspaceUsers(): Promise<Array<ISlackUserInfo>> {
        const result = await this.callApi('users.list', {});
        return result.members.map((user): ISlackUserInfo => {
            return {
                userId: user.id,
                name: user.name,
                displayName: user.real_name,
            };
        });
    }

    public async fullChannelHistory(channelId: string, nextCursor?: string): Promise<Array<ISlackMessage>> {
        let params = {
            channel: channelId,
            limit: 500,
        };
        if (nextCursor) { params = Object.assign(params, {cursor: nextCursor}); }
        const result = await this.callApi('conversations.history', params);

        if (result.messages instanceof Array) {
            let messages: Array<ISlackMessage> = result.messages.map( (message) => {
               return {
                   type: message.type,
                   ts: message.ts,
                   user: message.user,
                   text: message.text,
                   slackId: message.client_msg_id,
               };
            });

            if (result.response_metadata && result.response_metadata.next_cursor) {
                const prevMessages = await this.fullChannelHistory(channelId, result.response_metadata.next_cursor);
                messages = [...prevMessages, ...messages];
            }
            return messages;
        } else {
            return [];
        }
    }

    public async authorize(code: string, state: string, read: IRead, persis: IPersistence): Promise<any> {
        const endpoint = 'oauth.access';

        const storage = new SlacklineStorage(read, persis);
        const user = await storage.getUserForLoginId(state);
        if (!user) {
            this.logError(endpoint, `Invalid login id ${state}`);
            return Promise.resolve();
        }

        const requestParams = {
            client_id: this.clientID,
            client_secret: this.cSecret,
            code,
            redirect_uri: await this.app.getOauthEndpoint(),
        };
        const options: IHttpRequest = {
            params: requestParams,
            headers: this.headers,
        };
        const result = await this.http.post(url.resolve(this.baseURL, endpoint), options);
        if (result.content) {
            try {
                const resultBody = JSON.parse(result.content);
                if (resultBody.access_token) {
                    this.token = resultBody.access_token;
                    await storage.saveUserStorage(user, { token: resultBody.access_token });
                    const myInfo = await this.myInfo();
                    await storage.setUserForSlackId(user, myInfo.userId);
                    return resultBody.access_token;
                } else {
                    this.logError(endpoint, {
                        error: 'Not okay',
                        result: resultBody,
                        postParams: requestParams,
                    });
                }
            } catch (e) {
                this.logError(endpoint, e);
            }
        }
        return;
    }

    private async callApi(endpoint: string, params: any): Promise<any> {
        const cachedResponse = this.apiCache.find((item) => item.endpoint === endpoint && item.params === params);
        if (cachedResponse) {return Promise.resolve(cachedResponse.response); }
        const requestParams = Object.assign(params, {token: this.token});
        const options: IHttpRequest = {
            params: requestParams,
            headers: this.headers,
        };
        const result = await this.http.post(url.resolve(this.baseURL, endpoint), options);
        if (result.content) {
            try {
                const resultBody = JSON.parse(result.content);
                if (resultBody.ok) {
                    this.apiCache.push({endpoint, params, response: resultBody});
                    return resultBody;
                } else {
                    this.logError(endpoint, {
                        error: 'Not okay',
                        result: resultBody,
                        postParams: params,
                    });
                }
            } catch (e) {
                this.logError(endpoint, e);
            }
        }
        return;
    }

    private logError(endpoint: string, error: any) {
        this.logger.error(`Error in API call to ${endpoint}`, error);
    }
}

export interface ISlackUserInfo {
    userId: string;
    name: string;
    displayName: string;
}

export interface ISlackChannel {
    channelId: string;
    otherUser?: string;
    userInfo?: Array<ISlackUserInfo> | ISlackUserInfo;
    name?: string;
    creator?: string;
    normalized_name?: string;

    is_im: boolean;
    is_channel: boolean;
    is_mpim: boolean;
}

export interface ISlackMessage {
    type: string;
    ts: string;

    slackId: string;
    user?: string;
    text?: string;
}

interface IApiCache {
    endpoint: string;
    params: any;
    response: any;
}
