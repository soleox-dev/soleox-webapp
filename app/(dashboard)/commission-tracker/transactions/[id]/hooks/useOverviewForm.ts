// app/commission-tracker/transactions/[id]/hooks/useOverviewForm.ts
import { useState, useMemo } from 'react';
import { FieldSetting, roundCurrency, evaluateFormula } from '../types';

interface UseOverviewFormProps {
  overviewFields: FieldSetting[];
  selectedDeal: any;
  dealId: string;
  gciType: string;
  setGciType: (val: string) => void;
  gciPerc: number;
  setGciPerc: (val: number) => void;
  salesPrice: number;
  setSalesPrice: (val: number) => void;
  setPropertyAddress: (val: string) => void;
  setClientName: (val: string) => void;
  setPrimaryAgent: (val: string) => void;
  setClientType: (val: string) => void;
  setClosingDate: (val: string) => void;
  setAcceptanceDate: (val: string) => void;
  setListDate: (val: string) => void;
  setLeadSource: (val: string) => void;
  setSelectedDeal: React.Dispatch<React.SetStateAction<any>>;
  grossCommission: number;
  totalCommission: number;
}

export function useOverviewForm({
  overviewFields,
  selectedDeal,
  dealId,
  gciType,
  setGciType,
  gciPerc,
  setGciPerc,
  salesPrice,
  setSalesPrice,
  setPropertyAddress,
  setClientName,
  setPrimaryAgent,
  setClientType,
  setClosingDate,
  setAcceptanceDate,
  setListDate,
  setLeadSource,
  setSelectedDeal,
  grossCommission,
  totalCommission,
}: UseOverviewFormProps) {
  const [isEditingOverview, setIsEditingOverview] = useState<boolean>(false);
  const [overviewFormValues, setOverviewFormValues] = useState<Record<string, any>>({});
  const [showRequiredFieldsWarningModal, setShowRequiredFieldsWarningModal] = useState<boolean>(false);
  const [missingRequiredLabels, setMissingRequiredLabels] = useState<string[]>([]);

  // Restores section grouping from overviewFields
  const groupedOverviewSections = useMemo(() => {
    const groups: Record<string, FieldSetting[]> = {};

    overviewFields.forEach((field) => {
        // Uses field.section which came from f.section_name
        const section = field.section || 'General Info'; 
        if (!groups[section]) {
        groups[section] = [];
        }
        groups[section].push(field);
    });

    console.log('--- STEP 2: GROUPED SECTIONS PROCESSED ---', groups);
    return groups;
    }, [overviewFields]);

  const handleStartOverviewEdit = () => {
    const initialForm: Record<string, any> = {};

    overviewFields.forEach((field) => {
        let rawVal = selectedDeal ? selectedDeal[field.key] : undefined;

        // Fallback to custom_attributes if not found on top-level deal
        if (rawVal === undefined && selectedDeal?.custom_attributes) {
        let attrs = selectedDeal.custom_attributes;
        if (typeof attrs === 'string') {
            try { attrs = JSON.parse(attrs); } catch (e) { attrs = {}; }
        }
        rawVal = attrs[field.key];
        }

        // System field defaults
        if (rawVal === undefined || rawVal === null || rawVal === '') {
          if (field.key === 'id') rawVal = dealId;
          else if (field.key === 'agent_id') rawVal = selectedDeal?.agent_id || selectedDeal?.primary_agent || '';
          else if (field.key === 'gci_type') rawVal = gciType;
          else if (field.key === 'gci_perc') rawVal = gciPerc;
          else if (field.key === 'gci_amount') rawVal = grossCommission;
          else if (field.key === 'total_commission') rawVal = totalCommission;
        }

        if (field.key === 'sales_price') rawVal = salesPrice;
        if (field.key === 'gci_perc') rawVal = gciPerc;
        if (field.key === 'gci_amount') rawVal = grossCommission;
        if (field.key === 'total_commission') rawVal = totalCommission;

        initialForm[field.key] = rawVal ?? '';
    });

    setOverviewFormValues(initialForm);
    setIsEditingOverview(true);
  };

  const handleOverviewInputChange = (key: string, val: any) => {
    setOverviewFormValues((prev) => {
      const next = { ...prev, [key]: val };
      const currentSalesPrice = Number(key === 'sales_price' ? val : next.sales_price) || 0;
      const rawGciType = key === 'gci_type' ? val : (next.gci_type || gciType);
      const cleanGciType = String(rawGciType || '').toUpperCase().replace(/[\s_]+/g, '');

      if (key === 'gci_type') setGciType(val);

      if (cleanGciType.includes('PERCENT')) {
        if (key === 'sales_price' || key === 'gci_perc' || key === 'gci_type') {
          const rawPerc = Number(next.gci_perc) || 0;
          const rate = rawPerc > 1 ? rawPerc / 100 : rawPerc;
          next.gci_perc = rate;
          next.gci_amount = roundCurrency(currentSalesPrice * rate);
        }
      } else if (cleanGciType.includes('FLAT') || cleanGciType.includes('AMOUNT') || cleanGciType.includes('FEE')) {
        if (key === 'sales_price' || key === 'gci_amount' || key === 'gci_type') {
          const amountVal = Number(next.gci_amount) || 0;
          next.gci_perc = currentSalesPrice > 0 ? (amountVal / currentSalesPrice) : 0;
        }
      }

      const totCommSetting = overviewFields.find((f) => f.key === 'total_commission');
      if (totCommSetting?.calculation_formula) {
        next.total_commission = evaluateFormula(totCommSetting.calculation_formula, {
          ...selectedDeal,
          ...next,
          sales_price: currentSalesPrice,
          gci_amount: Number(next.gci_amount) || 0,
        });
      } else if (key === 'gci_amount' || key === 'sales_price' || key === 'gci_perc') {
        next.total_commission = Number(next.gci_amount) || 0;
      }

      return next;
    });
  };

  const validateFieldValue = (
    field: FieldSetting,
    val: any
  ): { isValid: boolean; isLegacyUnmatched: boolean; isRequiredMissing?: boolean; message?: string } => {
    const isEmpty = val === undefined || val === null || String(val).trim() === '' || String(val).trim() === '—';

    if (field.is_required && isEmpty) {
      return { isValid: false, isLegacyUnmatched: false, isRequiredMissing: true, message: 'This field is required.' };
    }

    if (isEmpty) {
      return { isValid: true, isLegacyUnmatched: false };
    }

    if (field.type === 'SELECT' && Array.isArray(field.options) && field.options.length > 0) {
      const strVal = String(val).trim();
      const matchesOption = field.options.some((opt) => opt.trim().toLowerCase() === strVal.toLowerCase());

      if (!matchesOption) {
        return {
          isValid: false,
          isLegacyUnmatched: true,
          message: 'Saved value is no longer listed in active field configurations.',
        };
      }
    }

    if (field.type === 'CURRENCY' || field.type === 'NUMBER' || field.type === 'PERCENT') {
      const numVal = Number(val);
      if (isNaN(numVal) || numVal < 0) {
        return { isValid: false, isLegacyUnmatched: false, message: 'Must be a valid positive number.' };
      }
    }

    return { isValid: true, isLegacyUnmatched: false };
  };

  const executeOverviewApply = () => {
    if (overviewFormValues.property_address !== undefined) setPropertyAddress(overviewFormValues.property_address);
    if (overviewFormValues.client_name !== undefined) setClientName(overviewFormValues.client_name);
    if (overviewFormValues.primary_agent !== undefined) setPrimaryAgent(overviewFormValues.primary_agent);
    if (overviewFormValues.agent_id !== undefined) setPrimaryAgent(overviewFormValues.agent_id);
    if (overviewFormValues.transaction_side !== undefined) setClientType(overviewFormValues.transaction_side);
    if (overviewFormValues.client_type !== undefined) setClientType(overviewFormValues.client_type);
    if (overviewFormValues.closing_date !== undefined) setClosingDate(String(overviewFormValues.closing_date).substring(0, 10));
    if (overviewFormValues.acceptance_date !== undefined) setAcceptanceDate(String(overviewFormValues.acceptance_date).substring(0, 10));
    if (overviewFormValues.list_date !== undefined) setListDate(String(overviewFormValues.list_date).substring(0, 10));
    if (overviewFormValues.lead_source !== undefined) setLeadSource(overviewFormValues.lead_source);
    if (overviewFormValues.sales_price !== undefined) setSalesPrice(Number(overviewFormValues.sales_price) || 0);
    if (overviewFormValues.gci_type !== undefined) setGciType(overviewFormValues.gci_type);

    if (overviewFormValues.gci_perc !== undefined) {
      const p = Number(overviewFormValues.gci_perc) || 0;
      setGciPerc(p > 1 ? p / 100 : p);
    }

    setSelectedDeal((prevDeal: any) => ({
      ...(prevDeal || {}),
      ...overviewFormValues,
      transaction_side: overviewFormValues.transaction_side || overviewFormValues.client_type || prevDeal?.transaction_side,
      status: overviewFormValues.transaction_status || overviewFormValues.status || prevDeal?.status,
      transaction_status: overviewFormValues.transaction_status || overviewFormValues.status || prevDeal?.transaction_status,
    }));

    setIsEditingOverview(false);
    setShowRequiredFieldsWarningModal(false);
  };

  const handleApplyOverviewEdit = () => {
    const missing: string[] = [];

    overviewFields.forEach((field) => {
      const rawDbVal = selectedDeal ? selectedDeal[field.key] : undefined;
      const val = overviewFormValues[field.key] ?? rawDbVal;

      const validation = validateFieldValue(field, val);
      if (field.is_required && validation.isRequiredMissing) {
        missing.push(field.label);
      }
    });

    if (missing.length > 0) {
      setMissingRequiredLabels(missing);
      setShowRequiredFieldsWarningModal(true);
    } else {
      executeOverviewApply();
    }
  };

  return {
    isEditingOverview,
    setIsEditingOverview,
    overviewFormValues,
    groupedOverviewSections,
    showRequiredFieldsWarningModal,
    setShowRequiredFieldsWarningModal,
    missingRequiredLabels,
    handleStartOverviewEdit,
    handleOverviewInputChange,
    validateFieldValue,
    executeOverviewApply,
    handleApplyOverviewEdit,
  };
}