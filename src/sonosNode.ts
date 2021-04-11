'use strict';

import { TreeItem, TreeItemCollapsibleState, extensions, Extension } from "vscode";
import { join } from 'path';
const { Sonos } = require('sonos');

export class SonosNode extends TreeItem {
    private _extensionPath: string = '';
    children: SonosNode[];
    constructor() {
        super('Working...');
        let extension: Extension<any> | undefined = extensions.getExtension("JamesBattersby.sonosbrowser");
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

    public isInContext(query: string) {
        if (this.contextValue) {
            return (this.contextValue.indexOf(query) != -1)
        }
        return false;
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
    private _coordinatorAddress: string;
    private _coordinatorDevice: any;
    private _parent: any;

    constructor(info: any, parent: any) {
        super();
        this._info = info;
        this.label = info.Name;
        this._parent = parent;
        this.collapsibleState = TreeItemCollapsibleState.Collapsed;
        this._coordinatorAddress = info.host;
        this._coordinatorDevice = new Sonos(this._coordinatorAddress);
        this.children.push(new SonosDevicesNode(this._info));
        this.children.push(new SonosQueueNode(this));
        this.addToContext('>mutable')
    }

    public getChildren(): SonosNode[] {
        this.refreshQueue();
        return this.children;
    }

    public refreshQueue() {
        this.children.forEach((childNode: SonosNode) => {
            if (childNode instanceof SonosQueueNode) {
                childNode.getChildren();
            }
        });
    }

    public async muteGroup(state: boolean) {
        this.children.forEach((childNode: SonosNode) => {
            if (childNode instanceof SonosDevicesNode) {
                childNode.children.forEach(async (deviceNode: SonosNode) => {
                    let device = new Sonos((deviceNode as SonosDeviceNode).getHost());
                    await device.setMuted(state);
                })
            }
        });
    }

    public setPlayingTrack(track: any) {
        let isPlaying: boolean = this.isInContext('>stoppable');
        this.children.forEach((childNode: SonosNode) => {
            if (childNode instanceof SonosQueueNode) {
                childNode.setPlayingTrack(track, isPlaying);
            }
        });
    }

    public async play(state: boolean) {
        await this._coordinatorDevice.togglePlayback()
    }

    public async nextTrack() {
        await this._coordinatorDevice.next()
    }

    public async previousTrack() {
        await this._coordinatorDevice.previous()
    }

    public getCoordinatingDevice() {
        return this._coordinatorDevice;
    }
}

export class SonosDevicesNode extends SonosNode {
    private _info: any;

    constructor(info: any) {
        super();
        this._info = info;
        this.label = 'Devices';
        this.collapsibleState = TreeItemCollapsibleState.Collapsed;
        this.populate();
    }

    public async populate() {
        let unsorted: any[] = [];
        this._info.ZoneGroupMember.forEach((member: any) => {
            unsorted.push(new SonosDeviceNode(member));
        })
        this.children = unsorted.sort((n1: any, n2: any) => {
            if (n1.label > n2.label) return 1;
            if (n1.label < n2.label) return -1;
            return 0;
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
    private _parent: SonosGroupNode;

    constructor(parent: SonosGroupNode) {
        super();
        this.label = 'Queue';
        this._parent = parent;
        this.collapsibleState = TreeItemCollapsibleState.Collapsed;
    }

    public setPlayingTrack(track: any, playing: boolean) {
        this.children.forEach((trackNode: SonosNode) => {
            (trackNode as SonosTrackNode).updatePlayingState(track, playing)
        });
    }

    public async getChildren() {
        this.children = [];
        let currentState: any = await this.getCoordinatingDevice().getCurrentState();
        let currentTrack: any = await this.getCoordinatingDevice().currentTrack();
        let currentQueue: any = await this.getCoordinatingDevice().getQueue();
        if (currentQueue?.items) {
            currentQueue.items.forEach((track: any) => {
                this.children.push(new SonosTrackNode(track, track.uri === currentTrack.uri, currentState, this))
            })
        }
        return this.children;
    }

    public getCoordinatingDevice() {
        return this._parent.getCoordinatingDevice();
    }
}

export class SonosTrackNode extends SonosNode {
    private _parent: SonosQueueNode;
    private _devicePlaying: boolean;
    private _current: boolean;
    private _track: any;

    constructor(track: any, current: boolean, state: string, parent: SonosQueueNode) {
        super();
        this._parent = parent;
        this._track = track;
        this._current = current;
        this._devicePlaying = state === 'playing';
        // TODO: Get album artwork working
        // this.tooltip = new MarkdownString(`![Album Art](${this._track.albumArtURI})`);
        // this.tooltip.isTrusted = true;
        this.setLabelAndContext();
    }

    public updatePlayingState(track: any, playing: boolean) {
        this._current = (this._track.uri === track.uri)
        this._devicePlaying = playing;
        this.setLabelAndContext();
    }

    private setLabelAndContext() {
        this.label = `${this._track.artist} - ${this._track.album} - ${this._track.title}${(this._devicePlaying && this._current) ? '🎶' : ''}`
        this.description = (this._devicePlaying && this._current) ? 'now playing' : '';
        if (this._devicePlaying && this._current) {
            this.addToContext('>playingTrack');
            this.removeFromContext('>stoppedTrack');

        } else {
            this.removeFromContext('>playingTrack');
            this.addToContext('>stoppedTrack');
        }
    }
}