'use strict';

import { TreeItem, TreeItemCollapsibleState } from "vscode";
const { Sonos } = require('sonos');

export class SonosNode extends TreeItem {
    children: SonosNode[];
    constructor() {
        super('Working...');
        this.children = [];
    }
}

export class GenericNode extends SonosNode {
    constructor(name: string) {
        super();
        this.label = name;
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
        this._info.ZoneGroupMember.forEach((member: any) => {
            this.children.push(new GenericNode(member.ZoneName));
        });
    }

    public getChildren(): SonosNode[] {
        return this.children;
    }

    public async getQueue() {
        let device: any = new Sonos(this._coordinator);
        device.getQueue().then( (result:any) => {
            console.log(JSON.stringify(result, null, 2));
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

    public getDispalyName(): string {
        let name: string = '';
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