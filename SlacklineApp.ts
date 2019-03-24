import {
    IAppAccessors, IConfigurationExtend, IConfigurationModify, IEnvironmentRead, IHttp,
    ILogger, IRead, ISettingRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {IApiEndpointMetadata} from '@rocket.chat/apps-engine/definition/api';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import {ISetting, SettingType} from '@rocket.chat/apps-engine/definition/settings';
import {SlacklineAPI} from './Api';
import {SlacklineCommand} from './commands/SlacklineCommand';
import {OauthEndpoint} from './endpoints/oauth';

export class SlacklineApp extends App {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    public async onEnable(environment: IEnvironmentRead, configurationModify: IConfigurationModify): Promise<boolean> {
        await this.checkConfigured(await environment.getSettings(), configurationModify);
        return super.onEnable(environment, configurationModify);
    }

    public async onSettingUpdated(setting: ISetting, configurationModify: IConfigurationModify, read: IRead, http: IHttp): Promise<void> {
        await this.checkConfigured(await read.getEnvironmentReader().getSettings(), configurationModify);
        return super.onSettingUpdated(setting, configurationModify, read, http);
    }

    public async initialize(configurationExtend: IConfigurationExtend, environmentRead: IEnvironmentRead): Promise<void> {
        await super.initialize(configurationExtend, environmentRead);

        await configurationExtend.settings.provideSetting({
            id: 'slack_client_id',
            type: SettingType.STRING,
            packageValue: '',
            required: true,
            public: false,
            i18nLabel: 'slack_api_key',
            i18nDescription: 'slack_api_key_description',
        });
        await configurationExtend.settings.provideSetting({
            id: 'slack_client_secret',
            type: SettingType.STRING,
            packageValue: '',
            required: true,
            public: false,
            i18nLabel: 'slack_api_secret',
            i18nDescription: 'slack_api_secret_description',
        });

        await configurationExtend.slashCommands.provideSlashCommand(new SlacklineCommand(this));
        return await configurationExtend.api.provideApi(new SlacklineAPI(this));
    }

    public async getOauthEndpoint() {
        const endpoints = this.getAccessors().providedApiEndpoints;
        const endpointPath = new OauthEndpoint(this).path;
        const oauthEndpoint = endpoints.find((endpoint) => endpoint.path === endpointPath) as IApiEndpointMetadata;
        const baseUrl = await this.getAccessors().environmentReader.getEnvironmentVariables().getValueByName('ROOT_URL');
        return baseUrl + oauthEndpoint.computedPath;
    }

    private async checkConfigured(read: ISettingRead, configurationModify: IConfigurationModify): Promise<void> {
        const clientId = await read.getValueById('slack_client_id');
        const clientSecret = await await read.getValueById('slack_client_secret');

        if (clientSecret === '') {
            this.getLogger().info('Disabling because client secret is not configured');
            return await configurationModify.slashCommands.disableSlashCommand(new SlacklineCommand(this).command);
        } else if (clientId === '') {
            this.getLogger().info('Disabling because client id is not configured');
            return await configurationModify.slashCommands.disableSlashCommand(new SlacklineCommand(this).command);
        } else {
            return await configurationModify.slashCommands.enableSlashCommand(new SlacklineCommand(this).command);
        }
    }
}
