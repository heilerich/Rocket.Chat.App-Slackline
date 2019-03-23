import {HttpStatusCode, IHttp, IModify, IPersistence, IRead} from '@rocket.chat/apps-engine/definition/accessors';
import {IApiEndpointInfo, IApiRequest, IApiResponse} from '@rocket.chat/apps-engine/definition/api';
import {IApp} from '@rocket.chat/apps-engine/definition/IApp';
import {CustomEndpoint} from '../helpers/CustomEndpoint';

export class SlackEventEndpoint extends CustomEndpoint {
    constructor(public app: IApp) {
        super(app);
        this.path = 'slackevent';
    }

    public async post(request: IApiRequest, endpoint: IApiEndpointInfo, read: IRead, modify: IModify, http: IHttp,
                      persis: IPersistence): Promise<IApiResponse> {
        return this.handleRequest(request, endpoint, read, modify, http, persis);
    }

    private async handleRequest(request: IApiRequest, endpoint: IApiEndpointInfo, read: IRead, modify: IModify,
                                http: IHttp, persis: IPersistence): Promise<IApiResponse> {
        if (!request.content.type) { return this.failRequest(request, 'No request type'); }
        switch (request.content.type) {
            case 'url_verification':
                return this.handleURLVerification(request);
            case 'event_callback':
                return this.handleEvent(request, endpoint, read, modify, http, persis);
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

    private async handleEvent(request: IApiRequest, endpoint: IApiEndpointInfo, read: IRead, modify: IModify,
                              http: IHttp, persis: IPersistence): Promise<IApiResponse> {
        if (!request.content.event || !request.content.event.type) {
            return this.failRequest(request, 'No event type');
        }

        switch (request.content.event.type) {
            case 'message':
                return this.handleMessageEvent(request, endpoint, read, modify, http, persis);
            default:
                return this.failRequest(request, 'Unknown event type');
        }
    }

    private async handleMessageEvent(request: IApiRequest, endpoint: IApiEndpointInfo, read: IRead, modify: IModify,
                                     http: IHttp, persis: IPersistence): Promise<IApiResponse> {
        if (!request.content.event || !request.content.event.type) {
            return this.failRequest(request, 'No event type');
        }

        switch (request.content.event.type) {
            case 'message':
                return this.failRequest(request, 'Not implemented');
            default:
                return this.failRequest(request, 'Unknown event type');
        }
    }
}
