export default function PrivacyPolicy() {
  return (
    <main className="max-w-4xl mx-auto p-8 leading-relaxed">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <p className="text-sm text-slate-500 mb-8">Effective Date: April 28, 2026</p>
      
      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">1. Data Collection</h2>
          <p className="text-slate-400">KREYA accesses Instagram basic profile info and media via Meta APIs. We do not store your credentials</p>
        </div>
        
        <div>
          <h2 className="text-xl font-semibold mb-2">2. How We Use Data</h2>
          <p className="text-slate-400">Information is used solely to facilitate content management and post generation within the app interface</p>
        </div>

        <div id="deletion">
          <h2 className="text-xl font-semibold mb-2">3. Data Deletion</h2>
          <p className="text-slate-400">To delete your data, revoke KREYA's access in your Instagram "Apps and Websites" settings or contact us via our GitHub repository</p>
        </div>
      </section>
    </main>
  );
}
