import Link from "next/link";

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-white px-4 sm:px-6 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-semibold text-black mb-4">Support</h1>
        <p className="text-zinc-600 mb-8">
          Have a question or need help using Agora? We&apos;re here to help.
        </p>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm text-left space-y-4">
          <p className="text-zinc-700">
            Email:{" "}
            <a href="mailto:buildagora@gmail.com" className="font-medium text-zinc-900 hover:underline">
              buildagora@gmail.com
            </a>
          </p>
          <p className="text-zinc-700">
            Phone:{" "}
            <a href="tel:+12567015929" className="font-medium text-zinc-900 hover:underline">
              (256) 701-5929
            </a>
          </p>
          <p className="text-zinc-600">Response time: Typically within a few hours.</p>
          <p className="text-zinc-600">
            Whether you&apos;re a buyer looking for material or a supplier on the network, feel free to reach out anytime.
          </p>
        </div>

        <div className="mt-6">
          <Link href="/" className="text-sm font-medium text-zinc-700 hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

