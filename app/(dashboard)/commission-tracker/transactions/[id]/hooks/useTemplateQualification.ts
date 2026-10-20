import { useEffect, useMemo, useState } from 'react';
import { transactionQualifiesForTemplate, type TemplateBoltSource } from '@/lib/transaction-default-view';

/**
 * True when the deal qualifies for at least one active commission template, false when it
 * qualifies for none, and null while templates or field types are still loading.
 * A deal that qualifies for no template is not expected to have payments, so the
 * full-allocation rule does not apply to it.
 */
export function useTemplateQualification(
  clientId: string | null | undefined,
  deal: Record<string, unknown> | null | undefined,
): boolean | null {
  const [templates, setTemplates] = useState<TemplateBoltSource[] | null>(null);
  const [fieldTypes, setFieldTypes] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [templateResponse, schemaResponse] = await Promise.all([
          fetch(`/api/commission-templates?client_id=${encodeURIComponent(clientId)}`),
          fetch('/api/schema/transactions', { headers: { 'x-client-id': clientId } }),
        ]);
        const templateData = await templateResponse.json().catch(() => ({}));
        const schemaData = await schemaResponse.json().catch(() => ({}));
        if (cancelled) return;
        setTemplates(templateResponse.ok && templateData.success ? (templateData.templates || []) as TemplateBoltSource[] : []);
        const catalog = (schemaData.catalog || schemaData.fields || []) as { field_key?: string; field_type?: string }[];
        setFieldTypes(Object.fromEntries((Array.isArray(catalog) ? catalog : []).flatMap((field) => {
          const key = String(field.field_key || '').trim();
          return key ? [[key, String(field.field_type || 'TEXT')]] : [];
        })));
      } catch {
        if (!cancelled) {
          setTemplates([]);
          setFieldTypes({});
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return useMemo(() => {
    if (!deal || templates === null || fieldTypes === null) return null;
    return templates.some((template) => (
      template.is_active !== false
      && transactionQualifiesForTemplate(deal, template.eligibility_formula || '', fieldTypes)
    ));
  }, [deal, templates, fieldTypes]);
}
