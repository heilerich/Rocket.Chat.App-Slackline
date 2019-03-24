import {IHttp, IMessageBuilder, IModify, IPersistence, IRead} from '@rocket.chat/apps-engine/definition/accessors';
import {IMessageAction, MessageActionType} from '@rocket.chat/apps-engine/definition/messages';
import {
    ISlashCommand,
    ISlashCommandPreview,
    ISlashCommandPreviewItem,
    SlashCommandContext,
    SlashCommandPreviewItemType,
} from '@rocket.chat/apps-engine/definition/slashcommands';
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
    public i18nDescription = 'slackline_command_description';
    public i18nParamsExample = 'slackline_command_params';
    public providesPreview = true;
    private commmand: any;

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
            return await this.executeCommand(command, context, read, modify, http, persis);
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
                    i18nTitle: 'slackline_command_description',
                    items: matchingCommands.map((cmd) => SlacklineCommand.previewItemForCommand(cmd)),
                });
            } else {
                return Promise.resolve({
                    i18nTitle: 'slackline_command_description',
                    items: Object.keys(SlacklineSubCommand).map((key) => SlacklineCommand.previewItemForCommand(SlacklineSubCommand[key])),
                });
            }
        } else {
            return Promise.resolve({
                i18nTitle: 'slackline_command_description',
                items: [SlacklineCommand.previewItemForCommand(SlacklineSubCommand.LOGIN)],
            });
        }
    }

    public executePreviewItem(item: ISlashCommandPreviewItem, context: SlashCommandContext, read: IRead, modify: IModify,
                              http: IHttp, persis: IPersistence): Promise<void> {
        return this.executeCommand(item.id as SlacklineSubCommand, context, read, modify, http, persis);
    }

    private async executeCommand(command: SlacklineSubCommand, context: SlashCommandContext, read: IRead,
                                 modify: IModify, http: IHttp, persis: IPersistence): Promise<void> {
        const token = await new SlacklineStorage(read, persis).getToken(context.getSender());
        if (!token && command !== SlacklineSubCommand.LOGIN) {
            return await this.messageToSelf('You must login first', context, modify);
        }
        switch (command) {
            case SlacklineSubCommand.IMPORT:
                return this.handleImport(context, read, modify, http, persis);
            case SlacklineSubCommand.LOGIN:
                return this.handleLogin(context, read, modify, http, persis);
            case SlacklineSubCommand.ENABLE:
                return this.handleEnable(context, read, modify, http, persis);
            case SlacklineSubCommand.DISABLE:
                return this.handleDisable(context, read, modify, http, persis);
            case SlacklineSubCommand.LOGOUT:
                return this.handleLogout(context, read, modify, persis);
        }
        return await this.messageToSelf(`Command ${command} not implemented`, context, modify);
    }

    private async handleLogout(context: SlashCommandContext, read: IRead, modify: IModify, persis: IPersistence): Promise<void> {
        const storage = new SlacklineStorage(read, persis);
        await storage.saveUserStorage(context.getSender(), {token: undefined});
        return this.messageToSelf('Logged out', context, modify);
    }

    private async handleLogin(context: SlashCommandContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void> {
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

    private async handleImport(context: SlashCommandContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void> {
        const id = context.getArguments()[1];
        const user = await new SlacklineStorage(read, persis).getUserForLoginId(id);

        if (user) {
            return this.messageToSelf(`user ${user.username}`, context, modify);
        } else {
            return this.messageToSelf(`not found`, context, modify);
        }
    }

    private async handleEnable(context: SlashCommandContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void> {
        const token = await new SlacklineStorage(read, persis).getToken(context.getSender());
        return this.messageToSelf(`${token}`, context, modify);
    }

    private async handleDisable(context: SlashCommandContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void> {
        return Promise.resolve();
    }

    private async messageToSelf(msg: string, context: SlashCommandContext, modify: IModify): Promise<void> {
        const messageBuilder = await SlacklineCommand.getMessageToSelf(context, modify);
        await messageBuilder.setText(msg);
        return await modify.getNotifier().notifyUser(await messageBuilder.getSender(), messageBuilder.getMessage());
    }
}

enum SlacklineSubCommand {
    IMPORT = 'import',
    LOGIN = 'login',
    ENABLE = 'enable',
    DISABLE = 'disable',
    LOGOUT = 'logout',
}
