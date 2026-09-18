export interface AuditLogInput {
  clientId: string;
  actorId: string;
  actorRole?: string;
  action: string;
  targetEntity: string;
  entityId: string;
  changesPayload?: Record<string, any>;
  ipAddress?: string;
}

export async function createAuditLog({
  clientId,
  actorId,
  actorRole = 'USER',
  action,
  targetEntity,
  entityId,
  changesPayload = {},
  ipAddress = '127.0.0.1',
}: AuditLogInput): Promise<string> {
  const auditId = `AUD_${Date.now()}`;

  // Log to server console; can be piped to external audit service or dedicated Supabase audit table
  console.log(`[AUDIT] ${auditId} | Tenant: ${clientId} | Actor: ${actorId} (${actorRole}) | Action: ${action} | Target: ${targetEntity}:${entityId}`, {
    changesPayload,
    ipAddress,
    timestamp: new Date().toISOString(),
  });

  return auditId;
}
