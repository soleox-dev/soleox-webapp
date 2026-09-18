'use client';

import React, { useEffect, useState } from 'react';
import { DynamicFormSection, LookupValue } from '@/lib/fields';

interface DynamicTransactionFormProps {
  clientId?: string;
  onSuccess?: (transactionId: string) => void;
}

export default function DynamicTransactionForm({
  clientId = 'DEMO',
  onSuccess,
}: DynamicTransactionFormProps) {
  const [sections, setSections] = useState<DynamicFormSection[]>([]);
  const [lookups, setLookups] = useState<LookupValue[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({
    client_id: clientId,
    transaction_side: 'Seller',
    gci_type: 'PERCENTAGE',
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadFormSchema() {
      try {
        const response = await fetch(`/api/fields?table=transactions`, {
          headers: { 'x-client-id': clientId },
        });
        const data = await response.json();

        if (data.success) {
          setSections(data.sections);
          setLookups(data.lookups);
        } else {
          setError(data.error || 'Failed to load form schema');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadFormSchema();
  }, [clientId]);

  const handleChange = (fieldKey: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [fieldKey]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': clientId,
        },
        body: JSON.stringify({
          ...formData,
          template_id: 'TPL_DEMO_7030', // Default waterfall template
        }),
      });

      const data = await response.json();

      if (data.success) {
        if (onSuccess) onSuccess(data.transactionId);
        alert(`Transaction ${data.transactionId} created and waterfall calculated!`);
      } else {
        setError(data.error || 'Failed to submit transaction');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-4 text-gray-500">Loading dynamic form schema...</div>;
  if (error) return <div className="p-4 text-red-600 bg-red-50 rounded">Error: {error}</div>;

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow space-y-8">
      <h2 className="text-2xl font-bold text-gray-800 border-b pb-2">New Transaction</h2>

      {sections.map((section) => (
        <div key={section.sectionName} className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-700 border-b border-gray-100 pb-1">
            {section.sectionName}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {section.fields.map((field) => {
              const fieldKey = field.fieldKey;

              return (
                <div key={field.id} className="flex flex-col space-y-1">
                  <label className="text-sm font-medium text-gray-600">
                    {field.fieldLabel} {field.isRequired && <span className="text-red-500">*</span>}
                  </label>

                  {/* SELECT / DROPDOWN CONTROL */}
                  {field.fieldType === 'SELECT' && (
                    <select
                      value={formData[fieldKey] || ''}
                      onChange={(e) => handleChange(fieldKey, e.target.value)}
                      required={field.isRequired}
                      className="p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="">Select option...</option>
                      {field.dropdownOptions && field.dropdownOptions.length > 0
                        ? field.dropdownOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))
                        : lookups.map((lkp) => (
                            <option key={lkp.id} value={lkp.optionValue}>
                              {lkp.optionLabel}
                            </option>
                          ))}
                    </select>
                  )}

                  {/* CURRENCY, NUMBER, OR PERCENT INPUT CONTROL */}
                  {(field.fieldType === 'CURRENCY' || field.fieldType === 'NUMBER' || field.fieldType === 'PERCENT') && (
                    <input
                      type="number"
                      step={field.fieldType === 'CURRENCY' ? '0.01' : field.fieldType === 'PERCENT' ? '0.001' : '1'}
                      value={formData[fieldKey] || ''}
                      onChange={(e) => handleChange(fieldKey, parseFloat(e.target.value) || 0)}
                      required={field.isRequired}
                      placeholder="0.00"
                      className="p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  )}

                  {/* DATE CONTROL */}
                  {field.fieldType === 'DATE' && (
                    <input
                      type="date"
                      value={formData[fieldKey] || ''}
                      onChange={(e) => handleChange(fieldKey, e.target.value)}
                      required={field.isRequired}
                      className="p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  )}

                  {/* STANDARD TEXT / AGENT PICKER CONTROL */}
                  {(field.fieldType === 'TEXT' || field.fieldType === 'AGENT_PICKER') && (
                    <input
                      type="text"
                      value={formData[fieldKey] || ''}
                      onChange={(e) => handleChange(fieldKey, e.target.value)}
                      required={field.isRequired}
                      placeholder={field.fieldLabel}
                      className="p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="pt-4 border-t flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {submitting ? 'Calculating Waterfall...' : 'Submit & Calculate'}
        </button>
      </div>
    </form>
  );
}