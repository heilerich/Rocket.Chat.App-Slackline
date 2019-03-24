import {IHttp, IModify, IPersistence, IRead} from '@rocket.chat/apps-engine/definition/accessors';
import {IApiEndpointInfo, IApiRequest, IApiResponse} from '@rocket.chat/apps-engine/definition/api';
import {CustomEndpoint} from '../helpers/CustomEndpoint';
import {HTMLMessage} from '../helpers/HTMLMessage';
import {SlackAPIClient} from '../helpers/SlackAPIClient';
import {SlacklineApp} from '../SlacklineApp';

export class OauthEndpoint extends CustomEndpoint {
    constructor(public app: SlacklineApp) {
        super(app);
        this.path = 'oauth';
    }

    public async get(request: IApiRequest, endpoint: IApiEndpointInfo, read: IRead, modify: IModify, http: IHttp,
                     persis: IPersistence): Promise<IApiResponse> {

        if (request.query.code && request.query.state) {
            const api = await SlackAPIClient.asyncConstruct(this.app);
            if (await api.authorize(request.query.code, request.query.state, read, persis)) {
                const myInfo = await api.myInfo();
                return this.success(HTMLMessage(`Hello ${myInfo.displayName}`, 'Login successful. You can close this window now.'));
            } else {
                return this.success(HTMLMessage('Authorization failed', 'Invalid link'));
            }
        } else {
            return this.failRequest(request, 'Expected code & state');
        }
    }
}
