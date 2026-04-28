"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type ContactSupplierFormProps = {
  supplierId: string;
  supplierName: string;
  /** Supplier's own category — used as MaterialRequest.categoryId. */
  categoryId: string;
  /** High-level request label sent as MaterialRequest.requestText. */
  requestText: string;
  /** Default body for the message textarea (usually the chat query). */
  messagePrefill: string;
};

export default function ContactSupplierForm({
  supplierId,
  supplierName,
  categoryId,
  requestText,
  messagePrefill,
}: ContactSupplierFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(messagePrefill);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedMessage = message.trim();

    if (!trimmedName) return setError("Please enter your name.");
    if (!trimmedPhone) return setError("Please enter your phone number.");
    if (!trimmedMessage) return setError("Please enter a message.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/buyer/material-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          categoryId,
          requestText: requestText || trimmedMessage,
          sendMode: "DIRECT",
          supplierIds: [supplierId],
          buyerName: trimmedName,
          buyerPhone: trimmedPhone,
          initialMessage: trimmedMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || `HTTP ${res.status}`);
      }
      const requestId = data.materialRequestId;
      if (!requestId) throw new Error("No requestId in response");
      router.push(`/request/${requestId}`);
    } catch (e: any) {
      setError(e?.message || "Couldn't send your message.");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Your name" htmlFor="contact-name">
        <input
          id="contact-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="First and last"
          autoComplete="name"
          required
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-800 outline-none transition focus:border-zinc-400 focus:shadow-sm"
        />
      </Field>

      <Field
        label="Your phone number"
        hint="The supplier will reply by text. Not shared with them."
        htmlFor="contact-phone"
      >
        <input
          id="contact-phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 555-1234"
          autoComplete="tel"
          required
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-800 outline-none transition focus:border-zinc-400 focus:shadow-sm"
        />
      </Field>

      <Field label="Message" htmlFor="contact-message">
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`Tell ${supplierName} what you need...`}
          rows={5}
          required
          className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-800 outline-none transition focus:border-zinc-400 focus:shadow-sm"
        />
      </Field>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-wait disabled:bg-zinc-400"
      >
        {submitting ? "Sending…" : `Send to ${supplierName} →`}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-zinc-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}
