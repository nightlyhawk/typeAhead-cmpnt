import { CountrySearch } from "@/components/country-search";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="w-full max-w-xl flex-1 px-6 py-24">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Country search
        </h1>
        <p className="mt-2 mb-8 text-sm text-zinc-600 dark:text-zinc-400">
          Type to search 254 countries by name, capital, code or demonym.
        </p>
        <CountrySearch />
      </main>
    </div>
  );
}
