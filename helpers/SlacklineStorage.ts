import {IPersistence, IRead} from '@rocket.chat/apps-engine/definition/accessors';
import {RocketChatAssociationModel, RocketChatAssociationRecord} from '@rocket.chat/apps-engine/definition/metadata';
import {IUser} from '@rocket.chat/apps-engine/definition/users';

export class SlacklineStorage {
    private static userAssoc(user: IUser): RocketChatAssociationRecord {
        return new RocketChatAssociationRecord(RocketChatAssociationModel.USER, user.id);
    }

    private static miscAssoc(id: string): RocketChatAssociationRecord {
        return new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, id);
    }

    constructor(private readonly read: IRead, private readonly persis: IPersistence) {
    }

    public async getUserStorage(user: IUser): Promise<ISlacklineUserStorage> {
        const assoc = SlacklineStorage.userAssoc(user);
        return await this.getStorage(assoc) as ISlacklineUserStorage;
    }

    public async saveUserStorage(user: IUser, storage: ISlacklineUserStorage): Promise<void> {
        const assoc = SlacklineStorage.userAssoc(user);
        await this.saveStorage(assoc, storage);
    }

    public async getToken(user: IUser): Promise<string | undefined> {
        const userStorage = await this.getUserStorage(user);
        return userStorage.token;
    }

    public async getLoginStorage(): Promise<ISlacklineLoginStorage> {
        const assoc = SlacklineStorage.miscAssoc('loginStorage');
        const loginStorage = await this.getStorage(assoc) as ISlacklineLoginStorage;
        if (!loginStorage.idMappings) { return {idMappings: {}}; }
        return loginStorage as ISlacklineLoginStorage;
    }

    public async saveLoginStorage(storage: ISlacklineLoginStorage): Promise<void> {
        const assoc = SlacklineStorage.miscAssoc('loginStorage');
        await this.saveStorage(assoc, storage);
    }

    public async getUserForLoginId(loginId: string): Promise<IUser | void> {
        const loginStorage = await this.getLoginStorage();
        if (loginStorage.idMappings[loginId]) {
            return await this.read.getUserReader().getById(loginStorage.idMappings[loginId]);
        } else {
            return Promise.resolve();
        }
    }

    public async setUserForLoginId(user: IUser, loginId: string): Promise<void> {
        const loginStorage = await this.getLoginStorage();
        loginStorage.idMappings[loginId] = user.id;
        return this.saveLoginStorage(loginStorage);
    }

    public async getStorage(assoc: RocketChatAssociationRecord): Promise<ISlacklineGenericStorage> {
        const datas = await this.read.getPersistenceReader().readByAssociation(assoc);
        if (datas.length === 0) { return {}; }
        return datas[0] as ISlacklineGenericStorage;
    }

    public async saveStorage(assoc: RocketChatAssociationRecord, storage: ISlacklineGenericStorage): Promise<void> {
        const oldStorage = this.getStorage(assoc);
        const newStorage = Object.assign(oldStorage, storage);
        newStorage.updatedAt = new Date();

        const existing = await this.read.getPersistenceReader().readByAssociation(assoc);
        if (existing.length > 0) {
            await this.persis.removeByAssociation(assoc);
        }

        await this.persis.createWithAssociation(newStorage, assoc);
    }
}

interface ISlacklineGenericStorage {
    updatedAt?: Date;
}

interface ISlacklineUserStorage extends ISlacklineGenericStorage {
    token?: string;
}

interface ISlacklineLoginStorage extends ISlacklineGenericStorage {
    idMappings: { [loginid: string]: string};
}
