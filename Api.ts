import {ApiEndpoint, ApiSecurity, ApiVisibility, IApi, IApiEndpoint} from '@rocket.chat/apps-engine/definition/api';
import {IApp} from '@rocket.chat/apps-engine/definition/IApp';
import {OauthEndpoint} from './endpoints/oauth';
import {SlackEventEndpoint} from './endpoints/slackevent';

export class SlacklineAPI implements IApi {
    public security: ApiSecurity = ApiSecurity.UNSECURE;
    public visibility: ApiVisibility = ApiVisibility.PUBLIC;

    public endpoints: Array<ApiEndpoint | IApiEndpoint>;

    constructor(public app: IApp) {
        this.endpoints = [
            new SlackEventEndpoint(app),
            new OauthEndpoint(app),
        ];
    }
}
