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
        const loginStorage = await this.getStorage(assoc) as any;
        if (!Object.keys(loginStorage).includes('loginIdMappings')) { loginStorage.loginIdMappings = {}; }
        if (!Object.keys(loginStorage).includes('slackIdMappings')) { loginStorage.slackIdMappings = {}; }
        return loginStorage as ISlacklineLoginStorage;
    }

    public async saveLoginStorage(storage: ISlacklineLoginStorage): Promise<void> {
        const assoc = SlacklineStorage.miscAssoc('loginStorage');
        await this.saveStorage(assoc, storage);
    }

    public async getUserForLoginId(loginId: string): Promise<IUser | void> {
        const loginStorage = await this.getLoginStorage();
        if (Object.keys(loginStorage.loginIdMappings).includes(loginId)) {
            return await this.read.getUserReader().getById(loginStorage.loginIdMappings[loginId]);
        } else {
            return Promise.resolve();
        }
    }

    public async getUserForSlackId(slackId: string): Promise<ISlacklineUser | void> {
        const loginStorage = await this.getLoginStorage();
        if (Object.keys(loginStorage.slackIdMappings).includes(slackId)) {
            const user = await this.read.getUserReader().getById(loginStorage.slackIdMappings[slackId]);
            const userStorage = await this.getUserStorage(user);
            return {slackline: userStorage, slackId, ...user};
        } else {
            return Promise.resolve();
        }
    }

    public async setUserForLoginId(user: IUser, loginId: string): Promise<void> {
        const loginStorage = await this.getLoginStorage();
        loginStorage.loginIdMappings[loginId] = user.id;
        return this.saveLoginStorage(loginStorage);
    }

    public async setUserForSlackId(user: IUser, slackId: string): Promise<void> {
        const loginStorage = await this.getLoginStorage();
        loginStorage.slackIdMappings[slackId] = user.id;
        return this.saveLoginStorage(loginStorage);
    }

    public async getStorage(assoc: RocketChatAssociationRecord): Promise<ISlacklineGenericStorage> {
        const datas = await this.read.getPersistenceReader().readByAssociation(assoc);
        if (datas.length === 0) { return {}; }
        return datas[0] as ISlacklineGenericStorage;
    }

    public async saveStorage(assoc: RocketChatAssociationRecord, storage: ISlacklineGenericStorage): Promise<void> {
        const oldStorage = await this.getStorage(assoc);
        const newStorage = {...oldStorage, ...storage};
        newStorage.lastUpdatedAt = new Date();

        const existing = await this.read.getPersistenceReader().readByAssociation(assoc);
        if (existing.length > 0) {
            await this.persis.removeByAssociation(assoc);
        }

        await this.persis.createWithAssociation(newStorage, assoc);
    }
}

interface ISlacklineGenericStorage {
    lastUpdatedAt?: Date;
}

interface ISlacklineUserStorage extends ISlacklineGenericStorage {
    token?: string;
    enabled?: boolean;
}

export interface ISlacklineUser extends IUser {
    slackline: ISlacklineUserStorage;
    slackId: string;
}

interface ISlacklineLoginStorage extends ISlacklineGenericStorage {
    loginIdMappings: { [loginid: string]: string};
    slackIdMappings: { [slackid: string]: string};
}
