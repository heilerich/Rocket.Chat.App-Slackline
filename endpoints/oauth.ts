import {IHttp, IModify, IPersistence, IRead} from '@rocket.chat/apps-engine/definition/accessors';
import {IApiEndpointInfo, IApiRequest, IApiResponse} from '@rocket.chat/apps-engine/definition/api';
import {IApp} from '@rocket.chat/apps-engine/definition/IApp';
import {CustomEndpoint} from '../helpers/CustomEndpoint';
import {SlackAPIClient} from '../helpers/SlackAPIClient';

export class OauthEndpoint extends CustomEndpoint {
    constructor(public app: IApp) {
        super(app);
        this.path = 'oauth';
    }

    public async post(request: IApiRequest, endpoint: IApiEndpointInfo, read: IRead, modify: IModify, http: IHttp,
                      persis: IPersistence): Promise<IApiResponse> {
        // this.app.getLogger().debug(`Received Request ${JSON.stringify(request)}`);
        const user = await new SlackAPIClient(http, this.app.getLogger(),
            'xoxp-68846292321-280122104279-585825589940-e7a3b0608e3d0c21faa8fa833ffbc690')
            .fullChannelHistory('D871C0WHG');
        return this.success(JSON.stringify(user));
    }

    protected async handleRequest(request: IApiRequest, endpoint: IApiEndpointInfo, read: IRead, modify: IModify,
                                  http: IHttp, persis: IPersistence): Promise<IApiResponse> {
        if (!request.content.type) {
            return this.success();
        }
        switch (request.content.type) {
            default:
                return this.failRequest(request);
        }
    }
}
