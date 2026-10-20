/**
 * Session cache for what the Commission Template button needs to know right away: the client's
 * templates, the transaction field catalog, and each transaction's submissions. Readers show the
 * cached value at once and still refresh it, so an edit made elsewhere shows up a moment later.
 * The Transactions list fills the submissions for every transaction when it loads.
 */

type SchemaField = {
  id?: string;
  field_key?: string;
  field_label?: string;
  field_type?: string;
  section_name?: string;
  calculation_formula?: string;
};

export type CachedSubmission = {
  id?: string;
  transaction_id?: string;
  template_id?: string;
  submitted_parameters?: unknown;
};

const templatesByClient = new Map<string, unknown[]>();
const schemaByClient = new Map<string, SchemaField[]>();
const submissionsByClient = new Map<string, Map<string, CachedSubmission[]>>();
/** Clients whose full submission list is cached, so a transaction missing from it has none. */
const completeSubmissionClients = new Set<string>();

export function cachedTemplates<T>(clientId: string): T[] | undefined {
  return templatesByClient.get(clientId) as T[] | undefined;
}

export function rememberTemplates(clientId: string, templates: unknown[]): void {
  templatesByClient.set(clientId, templates);
}

export function cachedSchema(clientId: string): SchemaField[] | undefined {
  return schemaByClient.get(clientId);
}

export function rememberSchema(clientId: string, catalog: SchemaField[]): void {
  schemaByClient.set(clientId, catalog);
}

/** Undefined means not known yet. An empty list means the transaction has no submission. */
export function cachedSubmissions(clientId: string, transactionId: string): CachedSubmission[] | undefined {
  const known = submissionsByClient.get(clientId)?.get(transactionId);
  if (known) return known;
  return completeSubmissionClients.has(clientId) ? [] : undefined;
}

export function rememberSubmissions(clientId: string, transactionId: string, submissions: CachedSubmission[]): void {
  const byTransaction = submissionsByClient.get(clientId) || new Map<string, CachedSubmission[]>();
  byTransaction.set(transactionId, submissions);
  submissionsByClient.set(clientId, byTransaction);
}

/** Every submission for the client, newest first, as the list page loads them. */
export function rememberAllSubmissions(clientId: string, submissions: CachedSubmission[]): void {
  const byTransaction = new Map<string, CachedSubmission[]>();
  submissions.forEach((submission) => {
    const transactionId = String(submission.transaction_id || '').trim();
    if (!transactionId) return;
    byTransaction.set(transactionId, [...(byTransaction.get(transactionId) || []), submission]);
  });
  submissionsByClient.set(clientId, byTransaction);
  completeSubmissionClients.add(clientId);
}
