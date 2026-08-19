import { EMPTY_COLLECTION_LIST, summarizeCollections } from '../dashboard-layout.js';

export class CollectionsHandler {
  constructor(metabaseClient) {
    this.metabaseClient = metabaseClient;
  }

  routes() {
    return {
      'mb_collection_create': (args) => this.handleCollectionCreate(args),
      'mb_collection_list': (args) => this.handleCollectionList(args),
      'mb_collection_move': (args) => this.handleCollectionMove(args),
      'mb_collection_copy': (args) => this.handleCollectionCopy(args),
      'mb_collection_permissions_get': (args) => this.handleCollectionPermissionsGet(args),
      'mb_collection_permissions_update': (args) => this.handleCollectionPermissionsUpdate(args),
    };
  }

  async handleCollectionCreate(args) {
    try {
      const collectionData = {
        name: args.name,
        description: args.description || '',
        parent_id: args.parent_id || null,
        color: args.color || '#509EE3'
      };

      const collection = await this.metabaseClient.request('POST', '/api/collection', collectionData);

      return {
        content: [{
          type: 'text',
          text: `✅ **Collection Created!**\\n\\n` +
            `🆔 Collection ID: ${collection.id}\\n` +
            `📁 Name: ${collection.name}\\n` +
            `📝 Description: ${collection.description || 'None'}\\n` +
            `🎨 Color: ${collection.color}\\n` +
            `📂 Parent: ${args.parent_id || 'Root'}`
        }]
      };

    } catch (error) {
      // Better error messages for common issues
      let userMessage = error.message;

      if (error.message.includes('already exists') || error.response?.status === 409) {
        userMessage = `Collection already exists with this name: "${args.name}"`;
      } else if (error.message.includes('permission') || error.response?.status === 403) {
        userMessage = `Permission denied. Contact admin for collection creation access.`;
      } else if (error.message.includes('parent') || (error.message.includes('not found') && args.parent_id)) {
        userMessage = `Parent collection not found: ID ${args.parent_id}`;
      }

      return {
        content: [{ type: 'text', text: `❌ Collection creation failed: ${userMessage}` }]
      };
    }
  }

  async handleCollectionList(args) {
    try {
      const collections = await this.metabaseClient.request('GET', '/api/collection');
      const rows = summarizeCollections(collections, args.parent_id);
      const parentLabel = args.parent_id == null ? 'all' : String(args.parent_id);
      const scope = args.parent_id == null ? 'all' : `descendants of ${parentLabel}`;
      let output = `📂 Collections (${scope}, ${rows.length})\n\n`;
      rows.slice(0, 50).forEach((col, i) => {
        output += `${i + 1}. [${col.id}] ${col.name}  parent_id=${col.parent_id ?? 'null'}\n`;
      });
      if (rows.length > 50) {
        output += `… ${rows.length - 50} more\n`;
      }

      return {
        content: [{ type: 'text', text: output }],
        structuredContent: { collections: rows, count: rows.length },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Collection list failed: ${error.message}` }],
        structuredContent: EMPTY_COLLECTION_LIST,
      };
    }
  }

  async handleCollectionMove(args) {
    try {
      let endpoint;
      const updateData = { collection_id: args.target_collection_id };

      switch (args.item_type) {
        case 'card':
          endpoint = `/api/card/${args.item_id}`;
          break;
        case 'dashboard':
          endpoint = `/api/dashboard/${args.item_id}`;
          break;
        case 'collection':
          endpoint = `/api/collection/${args.item_id}`;
          updateData.parent_id = args.target_collection_id;
          delete updateData.collection_id;
          break;
        default:
          throw new Error(`Unknown item type: ${args.item_type}`);
      }

      await this.metabaseClient.request('PUT', endpoint, updateData);

      return {
        content: [{
          type: 'text',
          text: `✅ **Item Moved!**\\n\\n` +
            `📦 Type: ${args.item_type}\\n` +
            `🆔 Item ID: ${args.item_id}\\n` +
            `📂 Target Collection: ${args.target_collection_id || 'Root'}`
        }]
      };

    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Move failed: ${error.message}` }]
      };
    }
  }

  async handleCollectionPermissionsGet(args) {
    const { collection_id } = args;

    try {
      const graph = await this.metabaseClient.request('GET', '/api/collection/graph');
      const collectionPerms = graph.groups;

      const permissions = [];
      for (const [groupId, perms] of Object.entries(collectionPerms)) {
        const collPerm = perms[collection_id];
        if (collPerm) {
          permissions.push({ group_id: groupId, permission: collPerm });
        }
      }

      return {
        content: [{
          type: 'text',
          text: `Collection ${collection_id} permissions:\n${permissions.map(p =>
            `  - Group ${p.group_id}: ${p.permission}`
          ).join('\n') || '  No specific permissions set'}`
        }]
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `❌ Collection permissions get error: ${error.message}` }] };
    }
  }

  async handleCollectionPermissionsUpdate(args) {
    const { collection_id, group_id, permission } = args;

    try {
      // Get current graph
      const graph = await this.metabaseClient.request('GET', '/api/collection/graph');

      // Update the permission
      if (!graph.groups[group_id]) {
        graph.groups[group_id] = {};
      }
      graph.groups[group_id][collection_id] = permission;

      // Save the updated graph
      await this.metabaseClient.request('PUT', '/api/collection/graph', graph);

      return {
        content: [{
          type: 'text',
          text: `✅ Collection ${collection_id} permission updated: Group ${group_id} = ${permission}`
        }]
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `❌ Collection permissions update error: ${error.message}` }] };
    }
  }

  async handleCollectionCopy(args) {
    const { collection_id, destination_id, new_name } = args;

    try {
      // Get source collection
      const sourceCollection = await this.metabaseClient.request('GET', `/api/collection/${collection_id}`);

      // Create new collection
      const newCollection = await this.metabaseClient.request('POST', '/api/collection', {
        name: new_name || `Copy of ${sourceCollection.name}`,
        description: sourceCollection.description,
        parent_id: destination_id || sourceCollection.parent_id
      });

      // Get items in source collection
      const items = await this.metabaseClient.request('GET', `/api/collection/${collection_id}/items`);
      const allItems = items.data || items;

      let copiedCards = 0;
      let copiedDashboards = 0;

      // Copy each item
      for (const item of allItems) {
        if (item.model === 'card') {
          await this.handleCardCopy({
            card_id: item.id,
            collection_id: newCollection.id
          });
          copiedCards++;
        } else if (item.model === 'dashboard') {
          await this.handleDashboardCopy({
            dashboard_id: item.id,
            collection_id: newCollection.id,
            deep_copy: false // Don't deep copy cards as they're already being copied
          });
          copiedDashboards++;
        }
      }

      return {
        content: [{
          type: 'text',
          text: `✅ Collection copied:\n  New Collection ID: ${newCollection.id}\n  Name: ${newCollection.name}\n  Cards copied: ${copiedCards}\n  Dashboards copied: ${copiedDashboards}`
        }]
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `❌ Collection copy error: ${error.message}` }] };
    }
  }
}
