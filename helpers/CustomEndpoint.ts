import {ApiEndpoint, IApiRequest, IApiResponse} from '@rocket.chat/apps-engine/definition/api';
import {HTMLMessage} from './HTMLMessage';

export class CustomEndpoint extends ApiEndpoint {
    protected async failRequest(request: IApiRequest, message?: any): Promise<IApiResponse> {
        this.app.getLogger().warn(`Received invalid call so ${this.path} endpoint`, {
            request,
            message,
        });
        return this.success(HTMLMessage('Internal Error', 'See application logs for details.'));
    }
}
