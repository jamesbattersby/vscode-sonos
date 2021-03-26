'use strict';

import { TreeItem, TreeItemCollapsibleState, extensions, Extension } from "vscode";
import { join } from 'path';
const { Sonos } = require('sonos');

export class SonosNode extends TreeItem {
    private _extensionPath: string = '';
    children: SonosNode[];
    constructor() {
        super('Working...');
        let extension: Extension<any> | undefined = extensions.getExtension("MediaKind.mkcontroller");
        if (extension) {
            this._extensionPath = extension.extensionPath;
        }

        this.children = [];
    }

    public setIcon(dark: string, light?: string) {
        if (!light) {
            light = dark;
        }
        this.iconPath = {
            light: join(this._extensionPath, 'resources', 'light', `${light}`),
            dark: join(this._extensionPath, 'resources', 'dark', `${dark}`)
        };
    }

    public addToContext(newContext: string) {
        if (this.contextValue === undefined) {
            this.contextValue = '';
        }
        if (this.contextValue.indexOf(newContext) === -1) {
            this.contextValue += newContext;
        }
    }

    public removeFromContext(toRemove: string) {
        this.contextValue = this.contextValue?.replace(toRemove, '');
    }

}

export class GenericNode extends SonosNode {
    constructor(name: string, collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None) {
        super();
        this.label = name;
        this.collapsibleState = collapsibleState;
    }
}

export class SonosGroupNode extends SonosNode {
    private _info: any;
    private _coordinator: string;
    constructor(info: any) {
        super();
        this._info = info;
        this.label = info.Name;
        this.collapsibleState = TreeItemCollapsibleState.Collapsed;
        this._coordinator = info.host;
        this.children.push(new SonosDevicesNode(this._info));
        this.children.push(new SonosQueueNode(this._coordinator));
        this.addToContext('>mutable')
    }

    public getChildren(): SonosNode[] {
        return this.children;
    }

    public async getQueue() {
        let device: any = new Sonos(this._coordinator);
        device.getQueue().then((result: any) => {
            console.log(JSON.stringify(result, null, 2));
        })
    }

    public async muteGroup(state: boolean) {
        this.children.forEach((childNode: SonosNode) => {
            if (childNode instanceof SonosDevicesNode) {
                childNode.children.forEach(async (deviceNode: SonosNode)=> {
                    let device = new Sonos((deviceNode as SonosDeviceNode).getHost());
                    await device.setMuted(state);
                })
            }
        });
    }

    public getDevice() {
        return new Sonos(this._coordinator);
    }
}

export class SonosDevicesNode extends SonosNode {
    private _coordinator: any;
    private _info: any;

    constructor(info: any) {
        super();
        this._coordinator = info.host;
        this._info = info;
        this.label = 'Devices';
        this.collapsibleState = TreeItemCollapsibleState.Collapsed;
        this.populate();
    }

    public async populate() {
        this._info.ZoneGroupMember.forEach((member: any) => {
            this.children.push(new SonosDeviceNode(member));
        })
    }
}

export class SonosDeviceNode extends SonosNode {
    private _info: any;

    constructor(deviceInfo: any) {
        super();
        this._info = deviceInfo;
        this.label = this.getDispalyName();
        this.collapsibleState = TreeItemCollapsibleState.Collapsed;
        this.children = this.populate(this._info);
    }

    public getChildren(): SonosNode[] {
        return this.children;
    }

    public getHost(): string {
        const regex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
        const address: string = this._info.Location.match(regex);
        return address[0];
    }

    public getDispalyName(): string {
        let name: string = '';
        if (this._info.ZoneName) {
            name = this._info.ZoneName;
        }
        if (this._info.roomName?.length) {
            name = this._info.roomName;
        }
        if (this._info.displayName?.length) {
            name = `${name} - ${this._info.displayName}`;
        }
        if (name.length === 0) {
            name = this._info.friendlyName;
        }
        return name;
    }

    public getMacAddress(): string {
        return this._info.MACAddress;
    }

    private populate(data: any): GenericNode[] {
        let nodes: GenericNode[] = [];
        for (let key of Object.keys(data)) {
            if (typeof data[key] === 'object') {
                let parentNode: GenericNode = new GenericNode(`${key}`);
                parentNode.collapsibleState = TreeItemCollapsibleState.Collapsed;
                parentNode.children = this.populate(data[key]);
                nodes.push(parentNode);
            } else {
                nodes.push(new GenericNode(`${key} - ${data[key]}`));
            }
        }
        return nodes;
    }
}

export class SonosQueueNode extends SonosNode {
    private _coordinator: any;

    constructor(coordinator: string) {
        super();
        this._coordinator = coordinator;
        this.label = 'Queue';
        this.collapsibleState = TreeItemCollapsibleState.Collapsed;
        this.populate();
    }

    public async populate() {
        let device: any = new Sonos(this._coordinator);
        device.getQueue().then((result: any) => {
            result.items.forEach((track: any) => {
                this.children.push(new GenericNode(`${track.artist} - ${track.album} - ${track.title}`))
            });
        })
    }
}
