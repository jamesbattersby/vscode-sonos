'use strict';

import {
    TreeView, TreeDataProvider, Event, EventEmitter, TreeItem, ProviderResult,
    ExtensionContext, window
} from 'vscode';
import { SonosNode as SonosNode, SonosDeviceNode, SonosGroupNode } from './sonosNode';
const { DeviceDiscovery } = require('sonos');

export class SonosExplorer {
    private _sonosNodeProvider: TreeView<SonosNode>;

    constructor(context: ExtensionContext) {
        const sonosNodeProvider: SonosNodeProvider = new SonosNodeProvider();
        this._sonosNodeProvider = window.createTreeView('sonosExplorer', { treeDataProvider: sonosNodeProvider, showCollapseAll: true });
    }
}

export class SonosNodeProvider implements TreeDataProvider<SonosNode> {
    private _onDidChangeTreeData: EventEmitter<SonosNode | undefined> = new EventEmitter<SonosNode | undefined>();
    readonly onDidChangeTreeData: Event<SonosNode | undefined> = this._onDidChangeTreeData.event;
    private _groupNodes: SonosGroupNode[];

    constructor() {
        this._groupNodes = [];
    }

    getTreeItem(element: SonosNode): TreeItem | Thenable<TreeItem> {
        return element;
    }

    getChildren(element?: SonosNode): ProviderResult<SonosNode[]> {
        if (element === undefined) {
            return Promise.resolve(this.getDevices());
        }
        if (element.children.length > 0) {
            return element.children;
        }
        return Promise.resolve(this.getNodes(element));
    }

    public refresh(item?: SonosNode) {
        this._onDidChangeTreeData.fire(item);
    }

    private async getDevices(): Promise<SonosNode[]> {
        DeviceDiscovery().once('DeviceAvailable', (device: any) => {
            device.getAllGroups().then((groups: any) => {
                let updated: boolean = false;
                groups.forEach((group: any) => {
                    let newNode: SonosGroupNode = new SonosGroupNode(group)
                    if (!this._groupNodes.find(node => node.label === newNode.label)) {
                        this._groupNodes.push(newNode);
                        newNode.getQueue();
                        updated = true;
                    }
                })
                if (updated) {
                    this.refresh();
                }
            })
        })
        return this._groupNodes;
    }

    private async getNodes(element: SonosNode): Promise<SonosNode[]> {
        return [];
    }
}
