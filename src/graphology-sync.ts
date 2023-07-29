import Graph from 'graphology';
import { Attributes, GraphEvents } from 'graphology-types';

/**
 * `Object.keys()` but type safe.
 */
const objectKeys = <T extends object>(obj: T): (keyof T)[] => {
  return Object.keys(obj) as (keyof T)[];
};

interface GraphSyncOptions {
  sleepEventsSource: (keyof GraphEvents)[];
  sleepEventsTarget: (keyof GraphEvents)[];
  mergeNode: ((node: string, source: Graph, target?: Graph) => boolean)[];
  mergeEdge: ((edge: string, source: Graph, target?: Graph) => boolean)[];
  dropNode: ((node: string, source: Graph, target?: Graph) => boolean)[];
  dropEdge: ((edge: string, source: Graph, target?: Graph) => boolean)[];
  ignoreAttributes: (keyof Attributes)[];
  includeAttributes: (keyof Attributes)[];
  ignoreNodeAttributes: (keyof Attributes)[];
  includeNodeAttributes: (keyof Attributes)[];
  ignoreEdgeAttributes: (keyof Attributes)[];
  includeEdgeAttributes: (keyof Attributes)[];
}

const SYNC_OPTIONS_NONE: GraphSyncOptions = {
  sleepEventsSource: [],
  sleepEventsTarget: [],
  mergeNode: [],
  mergeEdge: [],
  dropNode: [],
  dropEdge: [],
  ignoreAttributes: [],
  includeAttributes: [],
  ignoreNodeAttributes: [],
  includeNodeAttributes: [],
  ignoreEdgeAttributes: [],
  includeEdgeAttributes: []
};

const SYNC_OPTIONS_ALL: GraphSyncOptions = {
  ...SYNC_OPTIONS_NONE,
  mergeNode: [() => true],
  mergeEdge: [() => true]
};

const SYNC_OPTIONS_REASONABLE_SLEEP_EVENTS: Readonly<(keyof GraphEvents)[]> = [
  'nodeAdded',
  'nodeAttributesUpdated',
  'nodeDropped',
  'edgeAdded',
  'edgeAttributesUpdated',
  'edgeDropped'
];

const sync = (sourceGraph: Graph, targetGraph: Graph, options: Partial<GraphSyncOptions>) => {
  const opt: GraphSyncOptions = {
    ...SYNC_OPTIONS_NONE,
    ...options
  };

  // Temporarily remove specific event listeners until mutations are finished
  const sourceListenersToSleep = getGraphEventListeners(sourceGraph, opt.sleepEventsSource);
  objectKeys(sourceListenersToSleep).forEach(event => {
    sourceListenersToSleep[event].forEach(listener => {
      sourceGraph.off(event, listener);
    });
  });

  const targetListenersToSleep = getGraphEventListeners(targetGraph, opt.sleepEventsTarget);
  objectKeys(targetListenersToSleep).forEach(event => {
    sourceListenersToSleep[event].forEach(listener => {
      targetGraph.off(event, listener);
    });
  });

  // Graph attributes
  const newTargetAttributes = getNewAttributes(sourceGraph.getAttributes(), {
    include: opt.includeAttributes,
    ignore: opt.ignoreAttributes
  });
  targetGraph.mergeAttributes(newTargetAttributes);

  // Nodes
  sourceGraph.forEachNode((node, attributes) => {
    const targetHasNode = targetGraph.hasNode(node);

    // Merge nodes
    const shouldMergeNode = opt.mergeNode.reduce(
      (shouldMerge, predicate) => shouldMerge || predicate(node, sourceGraph, targetGraph),
      false
    );
    if (shouldMergeNode) {
      const newAttrs = getNewAttributes(attributes, {
        include: opt.includeNodeAttributes,
        ignore: opt.ignoreNodeAttributes
      });
      targetGraph.mergeNode(node, newAttrs);
    }

    // Drop nodes
    const shouldDropNode = targetHasNode
      ? opt.dropNode.reduce((shouldDrop, predicate) => shouldDrop || predicate(node, sourceGraph, targetGraph), false)
      : false;
    if (targetHasNode && shouldDropNode) {
      targetGraph.dropNode(node);
    }
  });

  // Edges
  sourceGraph.forEachEdge((edge, attributes, source, target) => {
    const targetHasEdge = targetGraph.hasEdge(edge);

    // Merge edges
    const shouldMergeEdge = opt.mergeEdge.reduce(
      (shouldMerge, predicate) => shouldMerge || predicate(edge, sourceGraph, targetGraph),
      false
    );
    if (shouldMergeEdge) {
      const newAttrs = getNewAttributes(attributes, {
        include: opt.includeEdgeAttributes,
        ignore: opt.ignoreEdgeAttributes
      });
      targetGraph.mergeEdgeWithKey(edge, source, target, newAttrs);
    }

    // Drop edges
    const shouldDropEdge = targetHasEdge
      ? opt.dropEdge.reduce((shouldDrop, predicate) => shouldDrop || predicate(edge, sourceGraph, targetGraph), false)
      : false;
    if (targetHasEdge && shouldDropEdge) {
      targetGraph.dropEdge(edge);
    }

    // Restore paused event listeners
    objectKeys(sourceListenersToSleep).forEach(event => {
      sourceListenersToSleep[event].forEach(listener => {
        sourceGraph.on(event, listener);
      });
    });

    objectKeys(targetListenersToSleep).forEach(event => {
      sourceListenersToSleep[event].forEach(listener => {
        targetGraph.on(event, listener);
      });
    });
  });
};

const getNewAttributes = (
  attributes: Attributes,
  options: { include: (keyof Attributes)[]; ignore: (keyof Attributes)[] }
) => {
  const attrs: Attributes = options.include.length > 0 ? {} : { ...attributes };
  options.ignore.forEach(prop => {
    delete attrs[prop];
  });
  options.include.forEach(prop => {
    attrs[prop] = attributes[prop];
  });

  return attrs;
};

const getGraphEventListeners = (graph: Graph, events: (keyof GraphEvents)[]) =>
  events.reduce(
    (eventsObj, event) => ({
      ...eventsObj,
      [event]: graph.listeners(event)
    }),
    {} as { [Event in keyof GraphEvents]: GraphEvents[Event][] }
  );

export { sync, GraphSyncOptions, SYNC_OPTIONS_ALL, SYNC_OPTIONS_NONE, SYNC_OPTIONS_REASONABLE_SLEEP_EVENTS };
