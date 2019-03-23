import {IHttp, IHttpRequest, ILogger} from '@rocket.chat/apps-engine/definition/accessors';
import * as url from 'url';

export class SlackAPIClient {
    private logger: ILogger;
    private http: IHttp;
    private readonly token?: string;
    private clientID?: string;
    private cSecret?: string;
    private baseURL = 'https://slack.com/api/';
    private headers = { 'Content-type': 'application/x-www-form-urlencoded'};

    constructor(http: IHttp, logger: ILogger, token?: string, clientID?: string, cSecret?: string) {
        this.http = http;
        this.logger = logger;
        this.token = token;
        this.clientID = clientID;
        this.cSecret = cSecret;
    }

    public async userInfo(userId: string): Promise<ISlackUserInfo> {
        const result = await this.callApi('users.info', {user: userId});
        return {
            userId: result.user.id,
            name: result.user.name,
            displayName: result.user.real_name,
        };
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
                is_channel: channel.is_channel,
                is_im: channel.is_im,
                is_mpim: channel.is_mpim,
                otherUser: channel.user,
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

    public async fullChannelHistory(channelId: string, nextCursor?: string): Promise<Array<ISlackMessage>> {
        let params = {
            channel: channelId,
            limit: 100,
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

    private async callApi(endpoint: string, params: any): Promise<any> {
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

    is_im: boolean;
    is_channel: boolean;
    is_mpim: boolean;
}

export interface ISlackMessage {
    type: string;
    ts: string;

    user?: string;
    text?: string;
}
