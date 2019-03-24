import {HttpStatusCode, IHttp, IModify, IPersistence, IRead} from '@rocket.chat/apps-engine/definition/accessors';
import {IApiEndpointInfo, IApiRequest, IApiResponse} from '@rocket.chat/apps-engine/definition/api';
import {IUser} from '@rocket.chat/apps-engine/definition/users';
import {CustomEndpoint} from '../helpers/CustomEndpoint';
import {SlackAPIClient} from '../helpers/SlackAPIClient';
import {ISlacklineUser, SlacklineStorage} from '../helpers/SlacklineStorage';
import {SlacklineApp} from '../SlacklineApp';

export class SlackEventEndpoint extends CustomEndpoint {
    constructor(public app: SlacklineApp) {
        super(app);
        this.path = 'slackevent';
    }

    public async post(request: IApiRequest, endpoint: IApiEndpointInfo, read: IRead, modify: IModify, http: IHttp,
                      persis: IPersistence): Promise<IApiResponse> {
        return this.handleRequest(request, read, modify, persis);
    }

    private async handleRequest(request: IApiRequest, read: IRead, modify: IModify,
                                persis: IPersistence): Promise<IApiResponse> {
        if (!request.content.type) { return this.failRequest(request, 'No request type'); }
        switch (request.content.type) {
            case 'url_verification':
                return this.handleURLVerification(request);
            case 'event_callback':
                return this.handleEvent(request, read, modify, persis);
            default:
                return this.failRequest(request, 'Unknown callback type');
        }
    }

    private async handleURLVerification(request: IApiRequest): Promise<IApiResponse> {
        if (!request.content.challenge) { return this.failRequest(request); }
        this.app.getLogger().debug('Responding to URL verification challenge');
        return this.json( {
            content: { challenge: request.content.challenge },
            status: HttpStatusCode.OK,
        });
    }

    private async handleEvent(request: IApiRequest, read: IRead, modify: IModify,
                              persis: IPersistence): Promise<IApiResponse> {
        if (!request.content.event || !request.content.event.type) {
            return this.failRequest(request, 'No event type');
        }

        switch (request.content.event.type) {
            case 'message':
                return this.handleMessageEvent(request, read, modify, persis);
            default:
                return this.failRequest(request, 'Unknown event type');
        }
    }

    private async handleMessageEvent(request: IApiRequest, read: IRead, modify: IModify,
                                     persis: IPersistence): Promise<IApiResponse> {
        if (!request.content.event || !request.content.event.type) {
            return this.failRequest(request, 'No event type');
        }

        const storage = new SlacklineStorage(read, persis);

        let authorizedUsers: Array<any> = await Promise.all(request.content.authed_users.map(async (userid) => {
            return storage.getUserForSlackId(userid);
        }));
        authorizedUsers = authorizedUsers.filter((u) => u !== undefined);

        const user = (authorizedUsers as Array<ISlacklineUser>).find((u) => u.slackline.enabled === true);

        if (user) {
            await this.postMessageForUser(user, request.content.event, read, modify, persis);
        } else {
            this.app.getLogger().info('Ignoring message event because none of the concerned users has enabled slackline');
        }
        return this.success();
    }

    private async postMessageForUser(user: ISlacklineUser, event: any, read: IRead, modify: IModify, persis: IPersistence): Promise<void> {
        const slackApi = await SlackAPIClient.asyncConstruct(this.app, user.slackline.token);
        const storage = new SlacklineStorage(read, persis);

        const userChannels = await slackApi.currentUserChannels();
        const sourceChannel = userChannels.find((channel) => channel.channelId === event.channel);
        if (sourceChannel) {
            if (sourceChannel.is_im) {
                if (!sourceChannel.otherUser) { await this.app.getLogger().error(`IM Channels should have otherUser`, sourceChannel); return; }
                const otherUser = await this.getUserForSlackId(sourceChannel.otherUser, storage, slackApi);
                if (!otherUser) { await this.app.getLogger().info(`Ignoring message. Could not map ${sourceChannel.otherUser} to local user`); return; }

                if (user.username === otherUser.username) { await this.app.getLogger().debug(`Ignoring message to self.`); return; }
                const participants = [user.username, otherUser.username];
                const destinationChannel = await read.getRoomReader().getDirectByUsernames(participants);

                const sender = await this.getUserForSlackId(event.user, storage, slackApi) as IUser;
                const message = modify.getCreator().startMessage().setSender(sender).setUsernameAlias(`${sender.username} (slack)`)
                    .setRoom(destinationChannel).setText(event.text);
                await modify.getCreator().finish(message);
            } else if (sourceChannel.is_mpim) {
                const sender = await this.getUserForSlackId(event.user, storage, slackApi);
                if (!sender) { await this.app.getLogger().error(`Ignoring message. Could not map ${event.user} to local user`); return; }
                const mpimMembers = await slackApi.channelMembers(sourceChannel.channelId);
                const localMembers = await Promise.all(mpimMembers.map(async (memberId) => {
                    return await this.getUserForSlackId(memberId.userId, storage, slackApi);
                }));
                if (localMembers.includes(undefined)) {
                    await this.app.getLogger().error(`Ignoring message. Could not map all MPIM members to local users`, mpimMembers);
                    return;
                }
                const destinationChannel = await read.getRoomReader().getDirectByUsernames((localMembers as Array<IUser>).map((member) => member.username));
                if (!destinationChannel) { await this.app.getLogger().error(`Ignoring message. Could not get MPIN room for ${localMembers}`); return; }
                const message = modify.getCreator().startMessage().setSender(sender).setUsernameAlias(`${sender.username} (slack)`)
                    .setRoom(destinationChannel).setText(event.text);
                await modify.getCreator().finish(message);
            } else if (sourceChannel.is_channel) {
                const sender = await this.getUserForSlackId(event.user, storage, slackApi);
                if (!sender) { await this.app.getLogger().error(`Ignoring message. Could not map ${event.user} to local user`); return; }
                if (!sourceChannel.name) { await this.app.getLogger().error(`Ignoring message. ${JSON.stringify(sourceChannel)} has no name.`); return; }
                const destinationChannel = await read.getRoomReader().getByName(sourceChannel.name);
                if (!destinationChannel) { await this.app.getLogger().error(`Ignoring message. Could not map ${sourceChannel.name} to local channel`); return; }

                const message = modify.getCreator().startMessage().setSender(sender).setUsernameAlias(`${sender.username} (slack)`)
                    .setRoom(destinationChannel).setText(event.text);
                await modify.getCreator().finish(message);
            } else {
                this.app.getLogger().error(`Invalid channel type`, sourceChannel);
            }
        } else {
            this.app.getLogger().error(`Couldn't find source channel ${event.channel}`);
        }
    }

    private async getUserForSlackId(slackId: string, storage: SlacklineStorage, api: SlackAPIClient): Promise<IUser | undefined> {
        const directlyMappedUser = await storage.getUserForSlackId(slackId);
        if (!directlyMappedUser) {
            const slackUser = await api.userInfo(slackId);
            const localUser = this.app.getAccessors().reader.getUserReader().getByUsername(slackUser.name);
            if (!localUser) {
                this.app.getLogger().debug(`Couldn't find local user ${slackUser.name}`);
                return;
            } else {
                return localUser;
            }
        } else {
            return directlyMappedUser;
        }
    }
}
