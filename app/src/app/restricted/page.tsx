export const metadata = { title: "Hyperscaler · Not available in your region" };

export default function Restricted() {
  return (
    <main className="min-h-screen bg-mine-bg text-mine-fg px-6 py-24 flex flex-col items-center text-center gap-6">
      <div className="font-display leading-none uppercase text-[80px] md:text-[120px] font-bold">Not here</div>
      <p className="text-mine-muted text-[16px] max-w-[560px]">
        Hyperscaler pays out Robinhood Stock Tokens, which are not available to persons in the United States, Canada, the United Kingdom or Switzerland. This site is not offered in your region.
      </p>
      <p className="text-mine-dim text-[13px] max-w-[560px]">If you believe this is a mistake, the check is based on your network location.</p>
    </main>
  );
}
