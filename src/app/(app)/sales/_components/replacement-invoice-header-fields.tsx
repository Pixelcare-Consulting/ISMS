"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SALE_PROOF_MAX_FILES } from "@/features/sales/utils/sale-proof";
import { SALE_TRANSACTION_NO_MAX_LENGTH } from "@/features/sales/utils/sale-transaction-no";
import { earliestSaleTransactionIso } from "@/features/sales/utils/transaction-date";

export type ReplacementHeaderLookup = { id: string; name: string };

export type ReplacementProofAttachment = { path: string; name: string };

/** Sales transaction header shared by Same Invoice and New Invoice. */
export type ReplacementInvoiceHeaderValue = {
  transactionNo: string;
  branchSoldName: string;
  alternateBranchName: string;
  transactionDate: string;
  customerName: string;
  contactNo: string;
  infoSlipVsoRrReleased: string;
  rrReceiveDeliver: string;
  paymentTypeId: string;
  saleTypeId: string;
  customerDeliveryMethodId: string;
  proofs: ReplacementProofAttachment[];
};

type ReplacementInvoiceHeaderFieldsProps = {
  idPrefix: string;
  /** Same Invoice: every field is a read-only check. */
  readOnly: boolean;
  pending: boolean;
  value: ReplacementInvoiceHeaderValue;
  onChange: (patch: Partial<ReplacementInvoiceHeaderValue>) => void;
  paymentTypes: ReplacementHeaderLookup[];
  saleTypes: ReplacementHeaderLookup[];
  deliveryMethods: ReplacementHeaderLookup[];
  proofUploading: boolean;
  onProofsSelected: (files: FileList | null) => void;
};

function lookupName(options: ReplacementHeaderLookup[], id: string): string {
  return options.find((option) => option.id === id)?.name ?? "";
}

export function ReplacementInvoiceHeaderFields({
  idPrefix,
  readOnly,
  pending,
  value,
  onChange,
  paymentTypes,
  saleTypes,
  deliveryMethods,
  proofUploading,
  onProofsSelected,
}: ReplacementInvoiceHeaderFieldsProps) {
  const locked = readOnly || pending;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-txn-no`}>Transaction number *</Label>
        <Input
          id={`${idPrefix}-txn-no`}
          value={value.transactionNo}
          onChange={(event) => onChange({ transactionNo: event.target.value })}
          placeholder="Enter transaction number"
          className="font-mono"
          autoComplete="off"
          maxLength={SALE_TRANSACTION_NO_MAX_LENGTH}
          readOnly={readOnly}
          disabled={locked}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-branch`}>Branch sold *</Label>
        <Input
          id={`${idPrefix}-branch`}
          value={value.branchSoldName}
          readOnly
          disabled
          className="bg-muted"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-stock-source`}>Branch or alternate branch *</Label>
        <Input
          id={`${idPrefix}-stock-source`}
          value={value.alternateBranchName}
          readOnly
          disabled
          className="bg-muted"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-date`}>Transaction date</Label>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          min={readOnly ? undefined : earliestSaleTransactionIso()}
          value={value.transactionDate}
          onChange={(event) => onChange({ transactionDate: event.target.value })}
          readOnly={readOnly}
          disabled={locked}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-customer`}>Customer name *</Label>
        <Input
          id={`${idPrefix}-customer`}
          value={value.customerName}
          onChange={(event) => onChange({ customerName: event.target.value })}
          placeholder="Customer name"
          readOnly={readOnly}
          disabled={locked}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-contact`}>Contact no.</Label>
        <Input
          id={`${idPrefix}-contact`}
          type="tel"
          inputMode="tel"
          value={value.contactNo}
          onChange={(event) => onChange({ contactNo: event.target.value })}
          placeholder="09XX XXX XXXX"
          maxLength={50}
          readOnly={readOnly}
          disabled={locked}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-info-slip`}>Info slip / VSO / RR released</Label>
        <Input
          id={`${idPrefix}-info-slip`}
          value={value.infoSlipVsoRrReleased}
          onChange={(event) =>
            onChange({ infoSlipVsoRrReleased: event.target.value })
          }
          placeholder="Input Info slip / VSO / RR released"
          readOnly={readOnly}
          disabled={locked}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-rr-receive`}>RR receive / deliver</Label>
        <Input
          id={`${idPrefix}-rr-receive`}
          value={value.rrReceiveDeliver}
          onChange={(event) => onChange({ rrReceiveDeliver: event.target.value })}
          placeholder="Input RR receive / deliver"
          readOnly={readOnly}
          disabled={locked}
        />
      </div>
      {readOnly ? (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-payment`}>Payment type *</Label>
          <Input
            id={`${idPrefix}-payment`}
            value={lookupName(paymentTypes, value.paymentTypeId)}
            readOnly
            disabled
            className="bg-muted"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Payment type *</Label>
          <SearchableSelect
            options={paymentTypes.map((option) => ({
              id: option.id,
              label: option.name,
            }))}
            value={value.paymentTypeId}
            onChange={(paymentTypeId) => onChange({ paymentTypeId })}
            placeholder="Select payment type…"
            searchPlaceholder="Search payment types…"
            emptyMessage="No payment types."
            disabled={pending}
            popoverClassName="z-70"
          />
        </div>
      )}
      {readOnly ? (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-sale-type`}>Sale type *</Label>
          <Input
            id={`${idPrefix}-sale-type`}
            value={lookupName(saleTypes, value.saleTypeId)}
            readOnly
            disabled
            className="bg-muted"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Sale type *</Label>
          <SearchableSelect
            options={saleTypes.map((option) => ({
              id: option.id,
              label: option.name,
            }))}
            value={value.saleTypeId}
            onChange={(saleTypeId) => onChange({ saleTypeId })}
            placeholder="Select sale type…"
            searchPlaceholder="Search sale types…"
            emptyMessage="No sale types."
            disabled={pending}
            popoverClassName="z-70"
          />
        </div>
      )}
      {readOnly ? (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-delivery`}>Customer delivery method *</Label>
          <Input
            id={`${idPrefix}-delivery`}
            value={lookupName(deliveryMethods, value.customerDeliveryMethodId)}
            readOnly
            disabled
            className="bg-muted"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Customer delivery method *</Label>
          <SearchableSelect
            options={deliveryMethods.map((option) => ({
              id: option.id,
              label: option.name,
            }))}
            value={value.customerDeliveryMethodId}
            onChange={(customerDeliveryMethodId) =>
              onChange({ customerDeliveryMethodId })
            }
            placeholder="Select delivery method…"
            searchPlaceholder="Search delivery methods…"
            emptyMessage="No delivery methods."
            disabled={pending}
            popoverClassName="z-70"
          />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-proof`}>Proof</Label>
        {readOnly ? (
          value.proofs.length > 0 ? (
            <ul className="space-y-1.5">
              {value.proofs.map((proof) => (
                <li
                  key={proof.path}
                  className="truncate rounded-md border bg-muted px-2 py-1.5 text-xs"
                  title={proof.name}
                >
                  {proof.name}
                </li>
              ))}
            </ul>
          ) : (
            <Input id={`${idPrefix}-proof`} value="None" readOnly disabled className="bg-muted" />
          )
        ) : (
          <>
            <Input
              id={`${idPrefix}-proof`}
              type="file"
              accept="image/*,.pdf"
              multiple
              disabled={
                proofUploading || pending || value.proofs.length >= SALE_PROOF_MAX_FILES
              }
              onChange={(event) => {
                onProofsSelected(event.target.files);
                event.target.value = "";
              }}
            />
            <p className="text-xs text-muted-foreground">
              You can attach up to {SALE_PROOF_MAX_FILES} images or PDFs
              {value.proofs.length > 0 ? ` · ${value.proofs.length} attached` : ""}.
            </p>
            {value.proofs.length > 0 ? (
              <ul className="space-y-1.5">
                {value.proofs.map((proof) => (
                  <li
                    key={proof.path}
                    className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs"
                  >
                    <span className="min-w-0 truncate" title={proof.name}>
                      {proof.name}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={proofUploading || pending}
                      onClick={() =>
                        onChange({
                          proofs: value.proofs.filter((item) => item.path !== proof.path),
                        })
                      }
                      aria-label={`Remove ${proof.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
