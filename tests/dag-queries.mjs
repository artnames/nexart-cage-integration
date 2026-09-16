const NODE_URL =
  process.env.NODE_URL ||
  "https://node.nexart.io";

const API_KEY =
  process.env.NEXART_API_KEY;

if (!API_KEY) {
  throw new Error(
    "NEXART_API_KEY is required for private DAG queries."
  );
}

const BUNDLES = {
  happy:
    "109b33b3-a485-47e9-a78d-9549ea52cead",

  loop:
    "87492823-96df-4545-8312-f5eb5f491891",

  dag:
    "fec228f8-5259-47e9-9339-c9d137576898"
};

function assert(
  condition,
  message
) {
  if (!condition) {
    throw new Error(message);
  }
}

async function requestJson(
  path,
  authenticated = true
) {
  const headers = {};

  if (authenticated) {
    headers.Authorization =
      `Bearer ${API_KEY}`;
  }

  const response =
    await fetch(
      `${NODE_URL}${path}`,
      {
        headers
      }
    );

  let body;

  try {
    body =
      await response.json();
  } catch {
    body = null;
  }

  return {
    response,
    body
  };
}

/*
 * Relationship endpoints may wrap their arrays using
 * relationship-specific names.
 *
 * Keep the extractor tolerant so this reference test
 * focuses on the graph semantics rather than presentation.
 */
function extractRows(body) {
  if (Array.isArray(body)) {
    return body;
  }

  if (!body) {
    return [];
  }

  const candidates = [
    body.steps,
    body.items,
    body.parents,
    body.children,
    body.ancestors,
    body.descendants,
    body.path,
    body.nodes
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function stepIdOf(row) {
  return (
    row?.stepId ||
    row?.step?.stepId ||
    row?.proof?.proofJson?.step?.stepId
  );
}

function nodeNameOf(row) {
  return (
    row?.nodeName ||
    row?.step?.nodeName ||
    row?.proof?.proofJson?.step?.nodeName
  );
}

async function authenticatedRows(
  path
) {
  const {
    response,
    body
  } =
    await requestJson(
      path,
      true
    );

  assert(
    response.ok,
    `${path} returned HTTP ${response.status}: ${JSON.stringify(body)}`
  );

  return extractRows(body);
}

/*
 * Authentication boundary.
 */
{
  const {
    response
  } =
    await requestJson(
      `/v1/cage/bundles/${BUNDLES.happy}`,
      false
    );

  assert(
    response.status === 401,
    `Expected unauthenticated query to return 401, got ${response.status}`
  );

  console.log(
    "Unauthenticated query: 401 PASS"
  );
}

/*
 * Happy-path graph.
 *
 * Validate that the relationship endpoints are available
 * and return coherent graph information.
 */
{
  const steps =
    await authenticatedRows(
      `/v1/cage/bundles/${BUNDLES.happy}/steps`
    );

  assert(
    steps.length === 4,
    `Happy path expected 4 steps, got ${steps.length}`
  );

  const ids =
    steps
      .map(stepIdOf)
      .filter(Boolean);

  assert(
    ids.length === 4,
    "Happy path step identities missing"
  );

  const first =
    ids[0];

  const last =
    ids[ids.length - 1];

  const children =
    await authenticatedRows(
      `/v1/cage/bundles/${BUNDLES.happy}/steps/${first}/children`
    );

  const descendants =
    await authenticatedRows(
      `/v1/cage/bundles/${BUNDLES.happy}/steps/${first}/descendants`
    );

  const parents =
    await authenticatedRows(
      `/v1/cage/bundles/${BUNDLES.happy}/steps/${last}/parents`
    );

  const ancestors =
    await authenticatedRows(
      `/v1/cage/bundles/${BUNDLES.happy}/steps/${last}/ancestors`
    );

  const path =
    await authenticatedRows(
      `/v1/cage/bundles/${BUNDLES.happy}/path?from=${encodeURIComponent(first)}&to=${encodeURIComponent(last)}`
    );

  assert(
    children.length >= 1,
    "Happy path root should have a child"
  );

  assert(
    descendants.length === 3,
    `Happy path root expected 3 descendants, got ${descendants.length}`
  );

  assert(
    parents.length >= 1,
    "Happy path terminal should have a parent"
  );

  assert(
    ancestors.length === 3,
    `Happy path terminal expected 3 ancestors, got ${ancestors.length}`
  );

  assert(
    path.length >= 2,
    "Happy path query should return a path"
  );

  console.log(
    "Happy-path DAG queries: PASS"
  );
}

/*
 * Loop-breaker execution.
 *
 * CAGE loops are unrolled into distinct executed step
 * instances. Repeated logical node names must therefore
 * have unique step IDs.
 */
{
  const steps =
    await authenticatedRows(
      `/v1/cage/bundles/${BUNDLES.loop}/steps`
    );

  assert(
    steps.length === 6,
    `Loop-breaker expected 6 steps, got ${steps.length}`
  );

  const ids =
    steps
      .map(stepIdOf)
      .filter(Boolean);

  assert(
    new Set(ids).size === 6,
    "Loop-breaker execution must have 6 unique step IDs"
  );

  const names =
    steps
      .map(nodeNameOf)
      .filter(Boolean);

  const plannerCount =
    names.filter(
      name =>
        name === "planner"
    ).length;

  const executorCount =
    names.filter(
      name =>
        name === "executor"
    ).length;

  assert(
    plannerCount === 3,
    `Expected planner to execute 3 times, got ${plannerCount}`
  );

  assert(
    executorCount === 2,
    `Expected executor to execute 2 times, got ${executorCount}`
  );

  /*
   * Exercise traversal from first to last executed step.
   */
  const first =
    ids[0];

  const last =
    ids[ids.length - 1];

  const descendants =
    await authenticatedRows(
      `/v1/cage/bundles/${BUNDLES.loop}/steps/${first}/descendants`
    );

  const ancestors =
    await authenticatedRows(
      `/v1/cage/bundles/${BUNDLES.loop}/steps/${last}/ancestors`
    );

  assert(
    descendants.length >= 1,
    "Loop execution descendants query returned no traversal"
  );

  assert(
    ancestors.length >= 1,
    "Loop execution ancestors query returned no traversal"
  );

  console.log(
    "Loop unrolling and traversal: PASS"
  );
}

/*
 * 22-step branching / merging DAG.
 *
 * The production acceptance run established:
 *
 * - root fanout = 3
 * - merge-1 parents = 3
 * - merge-1 children = 3
 * - merge-2 parents = 3
 * - complete ancestors = 21
 * - root descendants = 21
 * - merge-2 → complete path = 5 nodes
 */
{
  const steps =
    await authenticatedRows(
      `/v1/cage/bundles/${BUNDLES.dag}/steps`
    );

  assert(
    steps.length === 22,
    `Branching DAG expected 22 steps, got ${steps.length}`
  );

  const byName =
    new Map();

  for (const row of steps) {
    const name =
      nodeNameOf(row);

    if (!name) {
      continue;
    }

    if (!byName.has(name)) {
      byName.set(
        name,
        []
      );
    }

    byName
      .get(name)
      .push(row);
  }

  const findSingle =
    name => {
      const rows =
        byName.get(name) || [];

      assert(
        rows.length === 1,
        `Expected exactly one ${name} step, got ${rows.length}`
      );

      return rows[0];
    };

  const root =
    findSingle("root");

  const merge1 =
    findSingle("merge-1");

  const merge2 =
    findSingle("merge-2");

  const complete =
    findSingle("complete");

  const rootId =
    stepIdOf(root);

  const merge1Id =
    stepIdOf(merge1);

  const merge2Id =
    stepIdOf(merge2);

  const completeId =
    stepIdOf(complete);

  const rootChildren =
    await authenticatedRows(
      `/v1/cage/bundles/${BUNDLES.dag}/steps/${rootId}/children`
    );

  assert(
    rootChildren.length === 3,
    `Root expected 3 children, got ${rootChildren.length}`
  );

  const merge1Parents =
    await authenticatedRows(
      `/v1/cage/bundles/${BUNDLES.dag}/steps/${merge1Id}/parents`
    );

  assert(
    merge1Parents.length === 3,
    `merge-1 expected 3 parents, got ${merge1Parents.length}`
  );

  const merge1Children =
    await authenticatedRows(
      `/v1/cage/bundles/${BUNDLES.dag}/steps/${merge1Id}/children`
    );

  assert(
    merge1Children.length === 3,
    `merge-1 expected 3 children, got ${merge1Children.length}`
  );

  const merge2Parents =
    await authenticatedRows(
      `/v1/cage/bundles/${BUNDLES.dag}/steps/${merge2Id}/parents`
    );

  assert(
    merge2Parents.length === 3,
    `merge-2 expected 3 parents, got ${merge2Parents.length}`
  );

  const completeAncestors =
    await authenticatedRows(
      `/v1/cage/bundles/${BUNDLES.dag}/steps/${completeId}/ancestors`
    );

  assert(
    completeAncestors.length === 21,
    `Complete expected 21 ancestors, got ${completeAncestors.length}`
  );

  const rootDescendants =
    await authenticatedRows(
      `/v1/cage/bundles/${BUNDLES.dag}/steps/${rootId}/descendants`
    );

  assert(
    rootDescendants.length === 21,
    `Root expected 21 descendants, got ${rootDescendants.length}`
  );

  const merge2Path =
    await authenticatedRows(
      `/v1/cage/bundles/${BUNDLES.dag}/path?from=${encodeURIComponent(merge2Id)}&to=${encodeURIComponent(completeId)}`
    );

  assert(
    merge2Path.length === 5,
    `merge-2 → complete expected 5 path nodes, got ${merge2Path.length}`
  );

  console.log(
    "22-step branching/merging DAG: PASS"
  );
}

console.log();
console.log(
  "DAG query validation: PASS"
);
