import {IHttp, IMessageBuilder, IModify, IPersistence, IRead} from '@rocket.chat/apps-engine/definition/accessors';
import {IMessage, IMessageAction, MessageActionType} from '@rocket.chat/apps-engine/definition/messages';
import {IRoom, RoomType} from '@rocket.chat/apps-engine/definition/rooms';
import {
    ISlashCommand,
    ISlashCommandPreview,
    ISlashCommandPreviewItem,
    SlashCommandContext,
    SlashCommandPreviewItemType,
} from '@rocket.chat/apps-engine/definition/slashcommands';
import {IUser} from '@rocket.chat/apps-engine/definition/users';
import {ISlackChannel, ISlackMessage, SlackAPIClient} from '../helpers/SlackAPIClient';
import {SlacklineStorage} from '../helpers/SlacklineStorage';
import {makeID} from '../helpers/Util';
import {SlacklineApp} from '../SlacklineApp';

export class SlacklineCommand implements ISlashCommand {
    private static previewItemForCommand(command: SlacklineSubCommand): ISlashCommandPreviewItem {
        return {
            id: command,
            type: SlashCommandPreviewItemType.TEXT,
            value: `(${command}) ${SlacklineCommand.textForCommand(command)}`,
        };
    }

    private static textForCommand(command: SlacklineSubCommand): string {
        switch (command) {
            case SlacklineSubCommand.IMPORT:
                return 'Import old Slack messages for this channel';
            case SlacklineSubCommand.LOGIN:
                return 'Login to Slack to use Slackline';
            case SlacklineSubCommand.ENABLE:
                return 'Enable to receive new private messages from Slack';
            case SlacklineSubCommand.DISABLE:
                return 'Disable receiving new private messages from Slack';
            case SlacklineSubCommand.LOGOUT:
                return 'Logout fro Slack';
        }
    }

    private static async getMessageToSelf(context: SlashCommandContext, modify: IModify): Promise<IMessageBuilder> {
        const user = await context.getSender();
        const room = await context.getRoom();
        const msg = await modify.getCreator().startMessage();
        return msg.setUsernameAlias('Slackline').setEmojiAvatar(':evergreen_tree:').setSender(user).setRoom(room);
    }

    public command = 'slackline';
    // noinspection JSUnusedGlobalSymbols
    public i18nDescription = 'slackline_command_description';
    // noinspection JSUnusedGlobalSymbols
    public i18nParamsExample = 'slackline_command_params';
    // noinspection JSUnusedGlobalSymbols
    public providesPreview = true;

    private debugMode = false;

    constructor(private readonly app: SlacklineApp) {
    }

    public async executor(context: SlashCommandContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void> {
        const subCommand = context.getArguments()[0];
        if (!subCommand) {
            return await this.messageToSelf(`Please provide one of these commands: ${Object.values(SlacklineSubCommand)}`,
                context, modify);
        }
        if (Object.values(SlacklineSubCommand).includes(subCommand)) {
            const command = subCommand as SlacklineSubCommand;
            return await this.executeCommand(command, context, read, modify, persis);
        } else {
            return await this.messageToSelf(`Unknown command ${subCommand}`, context, modify);
        }
    }

    public async previewer(context: SlashCommandContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<ISlashCommandPreview> {
        this.app.getLogger().info('getting preview');
        const commandStart = context.getArguments()[0];
        const matchingCommands = Object.values(SlacklineSubCommand).filter((cmd: string) => cmd.startsWith(commandStart));
        const token = await new SlacklineStorage(read, persis).getToken(context.getSender());
        if (token) {
            if (matchingCommands.length > 0) {
                return Promise.resolve({
                    i18nTitle: 'slackline_command_preview_prefix',
                    items: matchingCommands.map((cmd) => SlacklineCommand.previewItemForCommand(cmd)),
                });
            } else {
                return Promise.resolve({
                    i18nTitle: 'slackline_command_preview_prefix',
                    items: Object.keys(SlacklineSubCommand).map((key) => SlacklineCommand.previewItemForCommand(SlacklineSubCommand[key])),
                });
            }
        } else {
            return Promise.resolve({
                i18nTitle: 'slackline_command_preview_prefix',
                items: [SlacklineCommand.previewItemForCommand(SlacklineSubCommand.LOGIN)],
            });
        }
    }

    public executePreviewItem(item: ISlashCommandPreviewItem, context: SlashCommandContext, read: IRead, modify: IModify,
                              http: IHttp, persis: IPersistence): Promise<void> {
        return this.executeCommand(item.id as SlacklineSubCommand, context, read, modify, persis);
    }

    private async executeCommand(command: SlacklineSubCommand, context: SlashCommandContext, read: IRead,
                                 modify: IModify, persis: IPersistence): Promise<void> {
        const token = await new SlacklineStorage(read, persis).getToken(context.getSender());
        if (!token && command !== SlacklineSubCommand.LOGIN) {
            return await this.messageToSelf('You must login first', context, modify);
        }
        switch (command) {
            case SlacklineSubCommand.IMPORT:
                return this.handleImport(context, read, modify, persis);
            case SlacklineSubCommand.LOGIN:
                return this.handleLogin(context, read, modify, persis);
            case SlacklineSubCommand.ENABLE:
                return this.handleEnable(context, read, modify, persis);
            case SlacklineSubCommand.DISABLE:
                return this.handleDisable(context, read, modify, persis);
            case SlacklineSubCommand.LOGOUT:
                return this.handleLogout(context, read, modify, persis);
        }
        return await this.messageToSelf(`Command ${command} not implemented`, context, modify);
    }

    private async handleLogout(context: SlashCommandContext, read: IRead, modify: IModify, persis: IPersistence): Promise<void> {
        const storage = new SlacklineStorage(read, persis);
        await storage.saveUserStorage(context.getSender(), {token: undefined, enabled: false});
        return this.messageToSelf('Logged out', context, modify);
    }

    private async handleLogin(context: SlashCommandContext, read: IRead, modify: IModify, persis: IPersistence): Promise<void> {
        const user = await context.getSender();

        const loginId = makeID(10);
        const clientId = await read.getEnvironmentReader().getSettings().getValueById('slack_client_id');
        const redirectUrl = await this.app.getOauthEndpoint();

        const message = await SlacklineCommand.getMessageToSelf(context, modify);

        const loginAction: IMessageAction = {
            image_url: 'https://platform.slack-edge.com/img/sign_in_with_slack.png',
            type: MessageActionType.BUTTON,
            is_webview: true,
            url: `https://slack.com/oauth/authorize?client_id=${clientId}` +
                `&state=${loginId}` +
                `&redirect_uri=${redirectUrl}` +
                `&scope=groups:history,groups:read,im:history,im:read,im:write,` +
                `groups:write,mpim:history,users:read,mpim:read,mpim:write`,
        };

        await message.addAttachment({
            actions: [loginAction],
        });

        await new SlacklineStorage(read, persis).setUserForLoginId(user, loginId);

        return modify.getNotifier().notifyUser(await message.getSender(), await message.getMessage());
    }

    private async handleImport(context: SlashCommandContext, read: IRead, modify: IModify, persis: IPersistence): Promise<void> {
        const storage = new SlacklineStorage(read, persis);
        const user = context.getSender();
        const userInfo = await storage.getUserStorage(user);
        const room = context.getRoom();

        const api = await SlackAPIClient.asyncConstruct(this.app, userInfo.token);

        switch (room.type) {
            case RoomType.DIRECT_MESSAGE:
                return await this.handleDirectMessageImport(read, room, context, modify, api);
            case RoomType.PRIVATE_GROUP:
                return await this.handlePrivateGroupImport(read, room, context, modify, api);
            default:
                return this.messageToSelf('Only private channel and direct messages are supported.', context, modify);
        }
    }

    private async handleDirectMessageImport(read: IRead, room: IRoom, context: SlashCommandContext, modify: IModify, api: SlackAPIClient): Promise<void> {
        const currentUserName = context.getSender().username;
        const slackChannel = await this.getSlackDirectMessageChannel(currentUserName, room, api);
        if (!slackChannel) {
            return this.messageToSelf(`Couldn't find this direct message channel on slack`, context, modify);
        }
        return await this.importChannel(slackChannel, read, room, context, modify, api);
    }

    private async handlePrivateGroupImport(read: IRead, room: IRoom, context: SlashCommandContext, modify: IModify, api: SlackAPIClient): Promise<void> {
        const slackChannel = await this.getSlackPrivateChannel(room, api);
        if (!slackChannel) {
            return this.messageToSelf(`Could not find channel with name ${room.displayName} on slack`, context, modify);
        }
        return await this.importChannel(slackChannel, read, room, context, modify, api);
    }

    private async importChannel(slackChannel: ISlackChannel, read: IRead, room: IRoom, context: SlashCommandContext, modify: IModify, api: SlackAPIClient) {
        const messageHistory = await api.fullChannelHistory(slackChannel.channelId);
        const allSlackUsers = await api.allWorkspaceUsers();
        const localMessages: Array<IMessage> = Array<IMessage>(); // TODO: await read.getRoomReader().getMessages(room.id); not implemented yet

        let nIgnored = 0;
        const processed = await Promise.all(messageHistory.map(async (message) => {
            const sender = allSlackUsers.find((u) => u.userId === message.user);
            if (!sender) {
                this.app.getLogger().debug(`Ignoring message because user ${message.user} couldn't be found on slack.`);
                nIgnored += 1;
                return;
            }
            const localSender = await read.getUserReader().getByUsername(sender.name);
            if (!localSender) {
                this.app.getLogger().debug(`Ignoring message because user ${message.user} couldn't be mapped to local user.`);
                nIgnored += 1;
                return;
            }

            const messageDate = new Date(parseInt(message.ts.split('.')[0], 10) * 1000);
            const oldMessage = localMessages.find((localm) => messageDate === localm.createdAt && localm.sender.username === sender.name);
            if (oldMessage) {
                this.app.getLogger().debug(`Message already imported`);
                nIgnored += 1;
                return;
            }
            if (!message.text) {
                this.app.getLogger().debug(`Ignoring empty message`);
                nIgnored += 1;
                return;
            }
            return this.postMessageToRoom(message, messageDate, localSender, room, modify);
        }));

        return this.messageToSelf(`Processed ${processed.length} messages. Ignored ${nIgnored}.`, context, modify);
    }

    private async postMessageToRoom(message: ISlackMessage, createdDate: Date, sender: IUser, room: IRoom, modify: IModify): Promise<void> {
        if (this.debugMode) {this.app.getLogger().debug('Posting message', {message, createdDate, sender, room}); }
        const messageBuilder = await modify.getCreator().startMessage().setSender(sender).setUsernameAlias(`${sender.username} (slack)`)
            .setRoom(room).setText(message.text ? message.text : '');
        const messageData = messageBuilder.getMessage();
        messageData.customFields = {importTs: createdDate.toISOString(), slackId: message.slackId};
        messageBuilder.setData(messageData);
        await modify.getCreator().finish(messageBuilder);
    }

    private async handleEnable(context: SlashCommandContext, read: IRead, modify: IModify, persis: IPersistence): Promise<void> {
        return this.setState(true, context, read, modify, persis);
    }

    private async handleDisable(context: SlashCommandContext, read: IRead, modify: IModify, persis: IPersistence): Promise<void> {
        return this.setState(false, context, read, modify, persis);
    }

    private async setState(state: boolean, context: SlashCommandContext, read: IRead, modify: IModify, persis: IPersistence): Promise<void> {
        const storage = new SlacklineStorage(read, persis);
        await storage.saveUserStorage(context.getSender(), {enabled: state});
        const newState = (await storage.getUserStorage(context.getSender())).enabled ? 'enabled' : 'disabled';
        return this.messageToSelf(`Slackline ${newState}.`, context, modify);
    }

    private async messageToSelf(msg: string, context: SlashCommandContext, modify: IModify): Promise<void> {
        const messageBuilder = await SlacklineCommand.getMessageToSelf(context, modify);
        await messageBuilder.setText(msg);
        this.app.getLogger().debug(`Notify user ${msg}`);
        return await modify.getNotifier().notifyUser(await messageBuilder.getSender(), messageBuilder.getMessage());
    }

    private async getSlackPrivateChannel(localChannel: IRoom, api: SlackAPIClient): Promise<ISlackChannel | undefined> {
        const allChannels = (await api.currentUserChannels()).filter((channel) => channel.is_channel || channel.is_mpim);
        const correspondingChannel = allChannels.find((slackChannel) => slackChannel.normalized_name === localChannel.slugifiedName);
        // TODO: MPIM room might have different name, find by members

        if (!correspondingChannel) {
            this.app.getLogger().error(`Could not map ${localChannel.displayName} to slack channel`);
            return;
        }
        return correspondingChannel;
    }

    private async getSlackDirectMessageChannel(currentUser: string, localChannel: IRoom, api: SlackAPIClient): Promise<ISlackChannel | undefined> {
        const localMembers = (await this.app.getAccessors().reader.getRoomReader().getMembers(localChannel.id)).map((user) => user.username);
        this.app.getLogger().debug('Trying to of IM conversation with local members', localMembers);
        if (localMembers.length !== 2 && localMembers.length !== 1) {
            this.app.getLogger().error(`Failed to map DM channel. DM channels should have exactly one or two members, this one has ${localMembers.length}`);
            return;
        }
        const allChannels = (await api.currentUserChannels()).filter((channel) => channel.is_im);
        const otherUserName = localMembers.length === 1 ? localMembers[0] : (localMembers[0] === currentUser ? localMembers[1] : localMembers[0]);
        const otherUser = (await api.allWorkspaceUsers()).find((user) => user.name === otherUserName);
        if (!otherUser) {
            this.app.getLogger().error(`Could not map ${otherUserName} to slack user`);
            return;
        }

        const correspondingChannel = allChannels.find((slackChannel) => slackChannel.otherUser === otherUser.userId);
        if (!correspondingChannel) {
            this.app.getLogger().error(`Could not find DM channel with ${otherUser.userId} on slack`);
            return;
        }

        return correspondingChannel;
    }
}

enum SlacklineSubCommand {
    IMPORT = 'import',
    LOGIN = 'login',
    ENABLE = 'enable',
    DISABLE = 'disable',
    LOGOUT = 'logout',
}
