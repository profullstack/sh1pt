import type { Metadata } from 'next';
import CommandBlock from '../components/CommandBlock';
import CopyableCommand from '../components/CopyableCommand';

export const metadata: Metadata = {
  title: 'CLI reference — sh1pt',
  description:
    'Every sh1pt command, every option, every example — build, promote, scale, iterate, plus secrets, config, entity, skills, and the full adapter tree.',
};

export default function DocsPage() {
  return (
    <main>
      <section>
        <div className="container">
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            Reference
          </div>
          <h1>CLI reference</h1>
          <p className="muted" style={{ maxWidth: 780 }}>
            Every sh1pt command with examples. Pair with <a href="/getting-started">getting started</a> if you want a guided tour. Anything not covered here is reachable via <code>sh1pt &lt;cmd&gt; --help</code>.
          </p>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h3 style={{ marginTop: 0 }}>On this page</h3>
            <div className="grid grid-3" style={{ gap: '0.5rem 1.5rem' }}>
              <div>
                <strong style={{ color: 'var(--fg)' }}>Primary verbs</strong>
                <ul className="muted" style={{ paddingLeft: '1.1rem', margin: '0.3rem 0' }}>
                  <li><a href="#build">build</a></li>
                  <li><a href="#promote">promote</a></li>
                  <li><a href="#scale">scale</a></li>
                  <li><a href="#iterate">iterate</a></li>
                </ul>
              </div>
              <div>
                <strong style={{ color: 'var(--fg)' }}>Auxiliary</strong>
                <ul className="muted" style={{ paddingLeft: '1.1rem', margin: '0.3rem 0' }}>
                  <li><a href="#login">login</a></li>
                  <li><a href="#secret">secret</a></li>
                  <li><a href="#config">config</a></li>
                  <li><a href="#skills">skills</a></li>
                </ul>
              </div>
              <div>
                <strong style={{ color: 'var(--fg)' }}>Self &amp; adapters</strong>
                <ul className="muted" style={{ paddingLeft: '1.1rem', margin: '0.3rem 0' }}>
                  <li><a href="#self">update / remove</a></li>
                  <li><a href="#adapters">adapter commands</a></li>
                  <li><a href="#globals">global flags</a></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Globals ---------------- */}
      <section id="globals">
        <div className="container">
          <h2>Global conventions</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            A handful of flags and patterns repeat across the tree. Mention them once here so the per-command sections stay focused.
          </p>
          <ul className="muted" style={{ paddingLeft: '1.2rem' }}>
            <li><code>--from &lt;input&gt;</code> — accepted by all four primary verbs. <code>&lt;input&gt;</code> can be a git URL, a live URL, a local path, or a manifest doc. sh1pt sniffs the kind and seeds the workflow.</li>
            <li><code>--json</code> — every <code>status</code> / <code>list</code> subcommand emits machine-readable JSON instead of the human view.</li>
            <li><code>--dry-run</code> — supported by anything that spends money, ships bits, or sends mail. Validates without firing.</li>
            <li><code>--help</code> — every command prints its own help. <code>sh1pt --help</code> prints the top-level tree.</li>
            <li>Adapter commands all follow <code>sh1pt &lt;category&gt; &lt;name&gt; setup|info</code> — see <a href="#adapters">adapter commands</a>.</li>
          </ul>
        </div>
      </section>

      {/* ---------------- build ---------------- */}
      <section id="build">
        <div className="container">
          <h2>build</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            Compile artifacts for every target your project declares. Runs locally by default; pass <code>--cloud</code> to run in the sh1pt build farm. Entity-ops nests here because a certificate / bylaws / filing packet is, structurally, just another build artifact.
          </p>

          <CommandBlock
            signature="sh1pt build [options]"
            description="Build the targets enabled in sh1pt.config.ts (or a subset)."
            options={[
              { flag: '-t, --target <id...>', description: 'target ids to build (default: all enabled)' },
              { flag: '-c, --channel <name>', description: 'release channel — stable | beta | canary (default: stable)' },
              { flag: '--cloud', description: 'run in the sh1pt cloud build farm' },
              { flag: '--from <input>', description: 'build from a git repo / URL / local path / manifest doc instead of CWD' },
            ]}
            examples={[
              { command: 'sh1pt build' },
              { command: 'sh1pt build -t pkg-npm pkg-homebrew --channel beta' },
              { command: 'sh1pt build --cloud' },
              { command: 'sh1pt build --from git@github.com:you/app.git' },
            ]}
          />

          <h3 style={{ marginTop: '2.5rem' }}>build entity — formation, compliance, spinouts</h3>
          <p className="muted" style={{ maxWidth: 780 }}>
            Drives jurisdiction packs (<code>packages/entity/&lt;code&gt;/</code>) — name checks, formation plans, doc bundles, filing handoff, recurring compliance.
          </p>

          <CommandBlock signature="sh1pt build entity pack list" description="List installed jurisdiction packs with support levels." examples={[{ command: 'sh1pt build entity pack list --json' }]} />
          <CommandBlock signature="sh1pt build entity pack info <pack>" description="Show entity types, filing modes, and support level for a pack (e.g. us, nz, uk)." examples={[{ command: 'sh1pt build entity pack info us-delaware' }]} />
          <CommandBlock
            signature="sh1pt build entity init <slug>"
            description="Initialise an entity workspace under ./entities/<slug>/."
            options={[
              { flag: '--parent <name>', description: 'parent entity (studio / holdco)' },
              { flag: '--jurisdiction <code>', description: 'pack code (us-delaware, nz, uk, hk, au, …)' },
              { flag: '--type <type>', description: 'entity type (c-corp, llc, limited-company, …)' },
              { flag: '--project <slug>', description: 'originating project slug (for spinouts)' },
            ]}
            examples={[{ command: 'sh1pt build entity init acme --jurisdiction us-delaware --type c-corp' }]}
          />
          <CommandBlock signature="sh1pt build entity compare --jurisdictions <csv>" description="Side-by-side jurisdiction comparison: support level, costs, manual steps." examples={[{ command: 'sh1pt build entity compare --jurisdictions us-delaware,nz,uk,hk' }]} />
          <CommandBlock signature="sh1pt build entity name-check <slug>" description="Run the pack's name search (or queue a manual name-check task)." examples={[{ command: 'sh1pt build entity name-check acme --name "Acme Labs"' }]} />
          <CommandBlock signature="sh1pt build entity plan generate <slug>" description="Generate a formation plan from the pack — required inputs, manual steps, recommended filing mode." examples={[{ command: 'sh1pt build entity plan generate acme' }]} />
          <CommandBlock signature="sh1pt build entity docs generate <slug>" description="Generate the full document bundle (certificate, bylaws/constitution, checklist, filing packet) into ./entities/<slug>/." examples={[{ command: 'sh1pt build entity docs generate acme' }]} />
          <CommandBlock
            signature="sh1pt build entity filing handoff <slug> --mode <mode>"
            description="Hand the filing off in the chosen mode."
            options={[{ flag: '--mode', description: 'direct | assisted | packet-only | provider | stub' }]}
            examples={[{ command: 'sh1pt build entity filing handoff acme --mode assisted' }]}
          />
          <CommandBlock signature="sh1pt build entity compliance enable <slug>" description="Generate the recurring compliance calendar (annual returns, tax filings, reminders)." examples={[{ command: 'sh1pt build entity compliance enable acme' }]} />
          <CommandBlock signature="sh1pt build entity compliance list <slug>" description="Show open / overdue / upcoming compliance tasks." examples={[{ command: 'sh1pt build entity compliance list acme --status overdue' }]} />
          <CommandBlock signature="sh1pt build entity status <slug>" description="Lifecycle state: draft → planned → packet-ready → filed → active." examples={[{ command: 'sh1pt build entity status acme' }]} />
          <CommandBlock signature="sh1pt build entity audit tail <slug>" description="Stream the entity's immutable audit log (jsonl)." examples={[{ command: 'sh1pt build entity audit tail acme -n 50' }]} />
          <CommandBlock signature="sh1pt build entity stub init <jurisdiction>" description="Model an entity in an unsupported jurisdiction (e.g. india, south-africa, nigeria) using the stub pack." examples={[{ command: 'sh1pt build entity stub init india --entity-type private-limited' }]} />
          <CommandBlock signature="sh1pt build entity experimental init <pack>" description="Spin up an experimental pack (e.g. dao-wy) — feature-flagged, narrow use cases." examples={[{ command: 'sh1pt build entity experimental init dao-wy --type dao-llc' }]} />
        </div>
      </section>

      {/* ---------------- promote ---------------- */}
      <section id="promote">
        <div className="container">
          <h2>promote</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            Anything that gets users — or investors. Ads, swag, organic social, podcasts, cold email, launch sites, chat-bridges, generated docs. Publishing to stores nests under <code>promote ship</code>.
          </p>

          <CommandBlock
            signature="sh1pt promote [options]"
            description="Launch ad campaigns across every connected ad network."
            options={[
              { flag: '--platform <id...>', description: 'subset of platforms (default: all in manifest)' },
              { flag: '--budget <amount>', description: 'per-platform budget override' },
              { flag: '--duration <span>', description: '7d | 14d | 30d | ongoing' },
              { flag: '--objective <kind>', description: 'install | web-traffic | awareness | engagement | signup | purchase' },
              { flag: '--dry-run', description: 'validate creatives/targeting without launching' },
              { flag: '--from <input>', description: 'crawl URL / repo / path to seed campaign metadata' },
            ]}
            examples={[
              { command: 'sh1pt promote --objective install --duration 14d' },
              { command: 'sh1pt promote --platform meta tiktok --budget 100 --dry-run' },
              { command: 'sh1pt promote --from https://example.com' },
            ]}
          />
          <CommandBlock signature="sh1pt promote setup" description="Walk through org/account/funding setup per ad platform — deep links for human-only steps, optional polling." options={[{ flag: '--platform <id...>', description: 'subset' }, { flag: '--poll', description: 're-check every 30s until all steps complete' }]} examples={[{ command: 'sh1pt promote setup --platform meta reddit --poll' }]} />
          <CommandBlock signature="sh1pt promote status" description="Aggregated metrics across active campaigns." examples={[{ command: 'sh1pt promote status --json' }]} />
          <CommandBlock signature="sh1pt promote stop" description="Pause or end campaigns." examples={[{ command: 'sh1pt promote stop --platform tiktok' }]} />
          <CommandBlock signature="sh1pt promote creatives" description="Edit ad creatives (headlines, descriptions, images, videos) — typically via manifest.promo.creatives." examples={[{ command: 'sh1pt promote creatives' }]} />

          <h3 style={{ marginTop: '2.5rem' }}>promote ship — publish to stores &amp; registries</h3>
          <CommandBlock
            signature="sh1pt promote ship [options]"
            description="Upload built artifacts to App Store, Play, Steam, Homebrew, npm, Docker Hub, Cloudflare Pages, etc. Pre-ship policy lint runs by default."
            options={[
              { flag: '-t, --target <id...>', description: 'target subset' },
              { flag: '-c, --channel <name>', description: 'stable | beta | canary' },
              { flag: '--dry-run', description: 'simulate without uploading' },
              { flag: '--skip-lint', description: 'skip policy linter (not recommended)' },
            ]}
            examples={[{ command: 'sh1pt promote ship --channel beta --dry-run' }]}
          />
          <CommandBlock signature="sh1pt promote ship init" description="Scaffold sh1pt.config.ts in the current project (interactive)." examples={[{ command: 'sh1pt promote ship init' }]} />
          <CommandBlock signature="sh1pt promote ship setup" description="Connect store credentials. One OAuth per store where possible; checklists for human-only steps." examples={[{ command: 'sh1pt promote ship setup --store appstore play --poll' }]} />
          <CommandBlock signature="sh1pt promote ship status" description="Per-target release status (live / in-review)." examples={[{ command: 'sh1pt promote ship status --json' }]} />
          <CommandBlock signature="sh1pt promote ship rollback" description="Roll back the latest release on one or more targets." examples={[{ command: 'sh1pt promote ship rollback -t play' }]} />
          <CommandBlock signature="sh1pt promote ship lint" description="Run the policy linter (spammy titles, duplicate metadata, invalid bundle ids, reckless submission rate). Auto-runs on ship." options={[{ flag: '--strict', description: 'exit non-zero on warnings as well' }]} examples={[{ command: 'sh1pt promote ship lint --strict --json' }]} />
          <CommandBlock signature="sh1pt promote ship logs" description="Tail build/ship logs." examples={[{ command: 'sh1pt promote ship logs -t appstore -f' }]} />
          <CommandBlock signature="sh1pt promote ship target add|remove|list|available <id>" description="Manage targets in the manifest." examples={[{ label: 'add', command: 'sh1pt promote ship target add pkg-homebrew' }, { label: 'list available', command: 'sh1pt promote ship target available' }]} />

          <h3 style={{ marginTop: '2.5rem' }}>promote merch — print &amp; ship swag</h3>
          <CommandBlock signature="sh1pt promote merch setup" description="Connect a POD provider (Printful, Printify) and optionally a storefront (Shopify, Etsy, Gumroad)." examples={[{ command: 'sh1pt promote merch setup --provider merch-printful' }]} />
          <CommandBlock
            signature="sh1pt promote merch create"
            description="Upload a design and mint SKUs across one or more product kinds."
            options={[
              { flag: '--design <path>', description: '300+ DPI artwork' },
              { flag: '--products <kind...>', description: 'tshirt hoodie sticker mug pen notebook etc.' },
              { flag: '--colors / --sizes', description: 'comma-separated lists' },
              { flag: '--price <usd> / --markup <percent>', description: 'pricing controls' },
            ]}
            examples={[{ command: 'sh1pt promote merch create --design ./logo.png --products tshirt sticker --markup 35' }]}
          />
          <CommandBlock signature="sh1pt promote merch list" description="Current SKUs across providers." examples={[{ command: 'sh1pt promote merch list --json' }]} />
          <CommandBlock signature="sh1pt promote merch publish --storefront <id>" description="Push SKUs to a public storefront for sale." examples={[{ command: 'sh1pt promote merch publish --storefront shopify' }]} />
          <CommandBlock
            signature="sh1pt promote merch giveaway"
            description="Bulk-ship swag for free (conferences, hackathons). Always pair with --budget-cap."
            options={[
              { flag: '--sku <id...>', description: 'SKUs to ship' },
              { flag: '--addresses <csvPath>', description: 'name,email,address1,city,region,zip,country' },
              { flag: '--budget-cap <usd>', description: 'abort if total exceeds this' },
            ]}
            examples={[{ command: 'sh1pt promote merch giveaway --sku tshirt-blue --addresses ./guests.csv --budget-cap 500' }]}
          />
          <CommandBlock signature="sh1pt promote merch orders" description="Order status (sales + giveaways)." examples={[{ command: 'sh1pt promote merch orders --json' }]} />
          <CommandBlock signature="sh1pt promote merch payout" description="Earnings summary and withdrawal." examples={[{ command: 'sh1pt promote merch payout' }]} />

          <h3 style={{ marginTop: '2.5rem' }}>promote investors — VC + angel outreach</h3>
          <CommandBlock signature="sh1pt promote investors setup" description="Connect CapitalReach (default outreach provider)." examples={[{ command: 'sh1pt promote investors setup --provider promo-capitalreach' }]} />
          <CommandBlock
            signature="sh1pt promote investors pitch"
            description="Send personalized intros + pitch deck to a targeted investor list."
            options={[
              { flag: '--stage', description: 'pre-seed | seed | series-a | series-b' },
              { flag: '--sectors <csv>', description: 'e.g. ai,devtools,saas' },
              { flag: '--check-min / --check-max', description: 'check size in $K' },
              { flag: '--leads-only', description: 'filter to lead investors only' },
              { flag: '--deck <path>', description: 'pitch deck path/URL' },
              { flag: '--dry-run', description: 'preview list + copy without sending' },
            ]}
            examples={[{ command: 'sh1pt promote investors pitch --stage seed --sectors ai,devtools --check-min 50 --check-max 500 --deck ./deck.pdf' }]}
          />
          <CommandBlock signature="sh1pt promote investors search" description="Search the investor database without launching; export CSV." examples={[{ command: 'sh1pt promote investors search --stage seed --leads-only --out ./leads.csv' }]} />
          <CommandBlock signature="sh1pt promote investors status" description="Funnel: sent / replies / meetings / term sheets." examples={[{ command: 'sh1pt promote investors status --json' }]} />
          <CommandBlock signature="sh1pt promote investors schedule" description="Meetings booked on your behalf (from the outreach tool's calendar)." examples={[{ command: 'sh1pt promote investors schedule' }]} />

          <h3 style={{ marginTop: '2.5rem' }}>promote crowdfund — equity + reward campaigns</h3>
          <CommandBlock signature="sh1pt promote crowdfund setup" description="Connect a crowdfunding platform." examples={[{ command: 'sh1pt promote crowdfund setup --provider promo-kickstarter' }]} />
          <CommandBlock signature="sh1pt promote crowdfund launch" description="Launch a campaign or post an update. Legal filings (Wefunder Form C, etc.) must be completed manually first." examples={[{ command: 'sh1pt promote crowdfund launch --provider promo-wefunder --target 50000 --duration 45' }]} />
          <CommandBlock signature="sh1pt promote crowdfund status" description="Pledges / backers / percent-funded." examples={[{ command: 'sh1pt promote crowdfund status --json' }]} />

          <h3 style={{ marginTop: '2.5rem' }}>promote social — organic cross-posting</h3>
          <CommandBlock signature="sh1pt promote social setup" description="Connect social accounts (OAuth where possible, app passwords elsewhere)." examples={[{ command: 'sh1pt promote social setup --platform social-x social-linkedin' }]} />
          <CommandBlock
            signature="sh1pt promote social post"
            description="Cross-post with per-platform adaptation (truncation, hashtag placement, media requirements)."
            options={[
              { flag: '--body <text>', description: 'core message — required' },
              { flag: '--title <text>', description: 'long-form headline (LinkedIn, Dev.to, Hashnode)' },
              { flag: '--hashtags <csv>', description: 'no #' },
              { flag: '--media <path...>', description: 'images and/or videos' },
              { flag: '--link <url>', description: 'CTA URL' },
              { flag: '--platform <id...>', description: 'subset; default: all connected' },
              { flag: '--schedule <iso>', description: 'publish at ISO timestamp; omit for now' },
            ]}
            examples={[{ command: 'sh1pt promote social post --body "Shipped v1.0 today." --hashtags devtools,launch --link https://example.com' }]}
          />
          <CommandBlock signature="sh1pt promote social metrics" description="Aggregated engagement across recent posts." examples={[{ command: 'sh1pt promote social metrics --json' }]} />

          <h3 style={{ marginTop: '2.5rem' }}>promote outreach — podcasts, cold email, launches</h3>
          <CommandBlock
            signature="sh1pt promote outreach podcasts"
            description="Discover relevant podcasts (Listen Notes) and send guest-pitch emails (Resend)."
            options={[
              { flag: '--niche <csv>', description: 'topic list (default: ai,startups,devtools)' },
              { flag: '--min-listeners <n>', description: 'minimum listener count' },
              { flag: '--language <code>', description: 'ISO language (default: en)' },
              { flag: '--deck <path>', description: 'media kit / pitch deck' },
            ]}
            examples={[{ command: 'sh1pt promote outreach podcasts --niche ai,devtools --min-listeners 5000' }]}
          />
          <CommandBlock
            signature="sh1pt promote outreach email"
            description="Cold email sequence via Resend. CAN-SPAM / CASL / GDPR compliance is your responsibility."
            options={[
              { flag: '--recipients <csv>', description: 'email,name,company,...' },
              { flag: '--subject <text>', description: 'subject line' },
              { flag: '--body <path>', description: 'markdown/html body file with {{placeholders}}' },
              { flag: '--from <addr>', description: 'must be a verified Resend domain' },
              { flag: '--rate <perHour>', description: 'send rate cap (default: 20)' },
            ]}
            examples={[{ command: 'sh1pt promote outreach email --recipients ./list.csv --subject "Quick intro" --body ./pitch.md --from anna@acme.dev' }]}
          />
          <CommandBlock signature="sh1pt promote outreach launch" description="Coordinate a launch on Product Hunt, BetaList, HN Show, Indie Hackers." examples={[{ command: 'sh1pt promote outreach launch --site producthunt betalist --schedule 2026-06-01T07:01:00Z' }]} />
          <CommandBlock signature="sh1pt promote outreach status" description="Open podcast pitches, active email sequences, upcoming launch slots." examples={[{ command: 'sh1pt promote outreach status --json' }]} />

          <h3 style={{ marginTop: '2.5rem' }}>promote bridge — relay between chat networks</h3>
          <CommandBlock signature="sh1pt promote bridge setup" description="Connect a chat network (bot token / app password / nsec / IRC nick)." examples={[{ command: 'sh1pt promote bridge setup --network bridge-discord bridge-matrix' }]} />
          <CommandBlock signature="sh1pt promote bridge connect <from> <to...>" description="Define a relay route. Format: <network>:<channel>. Repeatable destinations." options={[{ flag: '--filter <rule...>', description: 'no-bots | no-pings | no-links | no-emojis' }]} examples={[{ command: 'sh1pt promote bridge connect discord:#general matrix:#general --filter no-bots' }]} />
          <CommandBlock signature="sh1pt promote bridge start|stop" description="Run / stop the bridge daemon (persistent — pair with deploy-fly for HA)." examples={[{ command: 'sh1pt promote bridge start --detach' }, { command: 'sh1pt promote bridge stop' }]} />
          <CommandBlock signature="sh1pt promote bridge status" description="Active routes + message counts + last-seen per network." examples={[{ command: 'sh1pt promote bridge status --json' }]} />

          <h3 style={{ marginTop: '2.5rem' }}>promote docs — generated documents</h3>
          <CommandBlock
            signature="sh1pt promote docs generate"
            description="Produce a doc from markdown via Marp / Google Slides / pandoc / LuminPDF."
            options={[
              { flag: '--kind', description: 'pitch-deck | one-pager | sales-deck | case-study | press-kit | whitepaper | proposal' },
              { flag: '--format', description: 'pdf | pptx | docx | html | md' },
              { flag: '--markdown <path>', description: 'source (default: ./deck.md)' },
              { flag: '--template <id>', description: 'Google Slides id / Marp theme / pandoc reference doc' },
              { flag: '--provider <id>', description: 'docs-marp | docs-gslides | docs-pandoc | docs-lumin' },
              { flag: '--upload-to-lumin', description: 'auto-upload PDF for a shareable viewer link' },
            ]}
            examples={[{ command: 'sh1pt promote docs generate --kind pitch-deck --format pdf --markdown ./deck.md --provider docs-marp' }]}
          />
          <CommandBlock signature="sh1pt promote docs list" description="Recently generated docs." examples={[{ command: 'sh1pt promote docs list --json' }]} />
        </div>
      </section>

      {/* ---------------- scale ---------------- */}
      <section id="scale">
        <div className="container">
          <h2>scale</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            Cloud capacity ops: provisioning, DNS round-robin, rollouts, rightsizing. Raw provisioning lives under <code>scale deploy</code>.
          </p>

          <CommandBlock signature="sh1pt scale" description="Print help. With --from, probes the input and proposes scaling actions." options={[{ flag: '--from <input>', description: 'URL / repo / local path to probe' }]} examples={[{ command: 'sh1pt scale --from https://api.example.com' }]} />
          <CommandBlock
            signature="sh1pt scale up"
            description="Buy more instances of the current SKU. Routes through scale deploy under the hood."
            options={[
              { flag: '--instances <n>', description: 'how many to add' },
              { flag: '--provider <id>', description: 'cloud provider (default: same as existing fleet)' },
              { flag: '--max-hourly-price <usd>', description: 'abort if total/hr would exceed this' },
            ]}
            examples={[{ command: 'sh1pt scale up --instances 3 --max-hourly-price 1.50' }]}
          />
          <CommandBlock signature="sh1pt scale down" description="Tear down instances (cheapest / least-healthy first)." examples={[{ command: 'sh1pt scale down --instances 1' }]} />
          <CommandBlock
            signature="sh1pt scale auto"
            description="Set auto-scale rules. sh1pt cloud polls metrics and runs scale up/down on your behalf."
            options={[
              { flag: '--min / --max', description: 'instance count bounds' },
              { flag: '--target-cpu <percent>', description: 'utilization to maintain (default: 70)' },
              { flag: '--cooldown <seconds>', description: 'minimum gap between scale events' },
            ]}
            examples={[{ command: 'sh1pt scale auto --min 2 --max 10 --target-cpu 65 --cooldown 300' }]}
          />
          <CommandBlock
            signature="sh1pt scale dns"
            description="Wire round-robin DNS so traffic spreads across the fleet."
            options={[
              { flag: '--provider', description: 'dns-porkbun | dns-cloudflare' },
              { flag: '--domain <fqdn>', description: 'e.g. api.example.com' },
              { flag: '--ttl <seconds>', description: 'default 60' },
              { flag: '--proxied', description: 'cloudflare only — orange cloud' },
            ]}
            examples={[{ command: 'sh1pt scale dns --provider dns-cloudflare --domain api.example.com --proxied' }]}
          />
          <CommandBlock
            signature="sh1pt scale rollout"
            description="Stage a new version across the fleet."
            options={[
              { flag: '--version <id>', description: 'release id to roll out' },
              { flag: '--strategy', description: 'canary | blue-green | rolling' },
              { flag: '--percent <n>', description: 'canary only — start at N% of traffic' },
            ]}
            examples={[{ command: 'sh1pt scale rollout --version v1.4.2 --strategy canary --percent 10' }]}
          />
          <CommandBlock signature="sh1pt scale cost" description="Spend totals + per-provider breakdown + rightsizing suggestions." examples={[{ command: 'sh1pt scale cost --json' }]} />
          <CommandBlock signature="sh1pt scale status" description="Current fleet: instance count, DNS records, load distribution." examples={[{ command: 'sh1pt scale status --json' }]} />

          <h3 style={{ marginTop: '2.5rem' }}>scale deploy — raw provisioning</h3>
          <CommandBlock signature="sh1pt scale deploy setup" description="Connect cloud provider accounts (RunPod, DigitalOcean, Vultr, Hetzner, Atlantic.Net)." examples={[{ command: 'sh1pt scale deploy setup --provider cloud-runpod cloud-digitalocean' }]} />
          <CommandBlock
            signature="sh1pt scale deploy quote"
            description="Price-check a spec across every connected provider before provisioning."
            options={[
              { flag: '--kind', description: 'cpu-vps | gpu | bare-metal | managed-db | block-storage | object-storage' },
              { flag: '--cpu / --memory <gb>', description: 'CPU/RAM' },
              { flag: '--gpu <model> / --gpu-count <n>', description: 'GPU model + count' },
              { flag: '--region <id>', description: 'region preference' },
              { flag: '--spot', description: 'accept interruptible / spot instances' },
            ]}
            examples={[{ command: 'sh1pt scale deploy quote --kind gpu --gpu A100 --gpu-count 1 --spot' }]}
          />
          <CommandBlock
            signature="sh1pt scale deploy provision"
            description="Spin up a new instance. Always pair with --max-hourly-price for GPUs."
            options={[
              { flag: '--provider', description: 'e.g. cloud-runpod, cloud-digitalocean' },
              { flag: '--kind', description: 'see quote' },
              { flag: '--max-hourly-price <usd>', description: 'abort if quote exceeds this' },
              { flag: '--dry-run', description: 'show the plan without billing' },
            ]}
            examples={[{ command: 'sh1pt scale deploy provision --provider cloud-runpod --kind gpu --gpu A100 --max-hourly-price 4.00' }]}
          />
          <CommandBlock signature="sh1pt scale deploy list" description="All instances sh1pt is tracking across providers." examples={[{ command: 'sh1pt scale deploy list --json' }]} />
          <CommandBlock signature="sh1pt scale deploy destroy <instanceId> --provider <id>" description="Tear down an instance (stops billing)." examples={[{ command: 'sh1pt scale deploy destroy ix-abc123 --provider cloud-runpod' }]} />
          <CommandBlock signature="sh1pt scale deploy status <instanceId> --provider <id>" description="Health + hourly cost." examples={[{ command: 'sh1pt scale deploy status ix-abc123 --provider cloud-runpod' }]} />
        </div>
      </section>

      {/* ---------------- iterate ---------------- */}
      <section id="iterate">
        <div className="container">
          <h2>iterate</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            Pull metrics → agent proposes changes → apply → ship. The loop. Powered by the AI-CLI adapters under <code>iterate agents</code>.
          </p>

          <CommandBlock signature="sh1pt iterate" description="Print help. With --from, attaches an observation loop to an existing URL/repo/path." options={[{ flag: '--from <input>', description: 'URL / repo / local path / manifest doc' }]} examples={[{ command: 'sh1pt iterate --from https://example.com' }]} />
          <CommandBlock
            signature="sh1pt iterate run"
            description="Single-shot cycle: pull metrics → propose changes → confirm → ship."
            options={[
              { flag: '--agent', description: 'claude | codex | qwen (default: claude)' },
              { flag: '--scope', description: 'copy | pricing | onboarding | perf | bugs | all' },
              { flag: '--auto-apply', description: 'skip confirmation (pair with --max-files)' },
              { flag: '--max-files <n>', description: 'hard cap on files the agent may touch (default: 5)' },
            ]}
            examples={[{ command: 'sh1pt iterate run --scope copy --auto-apply --max-files 3' }]}
          />
          <CommandBlock
            signature="sh1pt iterate watch"
            description="Daemon mode — run a cycle on every significant metric change."
            options={[
              { flag: '--agent', description: 'agent id' },
              { flag: '--interval <seconds>', description: 're-check interval (default: 3600)' },
              { flag: '--quiet-hours <start-end>', description: 'e.g. 22-08 to pause overnight' },
            ]}
            examples={[{ command: 'sh1pt iterate watch --agent claude --interval 1800 --quiet-hours 22-08' }]}
          />
          <CommandBlock signature="sh1pt iterate goals [kv...]" description="Declare success metrics iterate steers toward. With no args, lists current goals." examples={[{ command: 'sh1pt iterate goals conversion=8% cpi=2.00 churn=5%' }]} />
          <CommandBlock
            signature="sh1pt iterate test <hypothesis>"
            description="Spawn an A/B experiment around a hypothesis."
            options={[
              { flag: '--variant <text...>', description: 'the B-side change; A is current state' },
              { flag: '--traffic <percent>', description: 'percent routed to B (default: 50)' },
              { flag: '--min-sample <n>', description: 'minimum events before stopping (default: 1000)' },
            ]}
            examples={[{ command: 'sh1pt iterate test "shorter headline lifts signup" --variant "Ship faster." --traffic 50 --min-sample 2000' }]}
          />
          <CommandBlock signature="sh1pt iterate experiments" description="Active and recently-ended experiments with significance." examples={[{ command: 'sh1pt iterate experiments --json' }]} />

          <h3 style={{ marginTop: '2.5rem' }}>iterate agents — orchestrate AI coding CLIs</h3>
          <CommandBlock signature="sh1pt iterate agents list" description="Which agent CLIs are installed on this machine." examples={[{ command: 'sh1pt iterate agents list' }]} />
          <CommandBlock signature="sh1pt iterate agents setup" description="Install + auth the agent CLIs you want sh1pt to drive." options={[{ flag: '--agent <id...>', description: 'subset (default: claude codex qwen)' }]} examples={[{ command: 'sh1pt iterate agents setup --agent claude codex' }]} />
          <CommandBlock
            signature="sh1pt iterate agents run <agent> <prompt...>"
            description="Fire a one-shot prompt at a specific agent."
            options={[
              { flag: '--files <path...>', description: 'files the agent should focus on' },
              { flag: '--model <id>', description: 'model override' },
            ]}
            examples={[{ command: 'sh1pt iterate agents run claude "tighten the hero copy" --files app/page.tsx' }]}
          />
          <CommandBlock signature="sh1pt iterate agents talk [agent]" description="Interactive session with an agent (the app-generation fast path)." options={[{ flag: '--recipe <id>', description: 'preload a recipe prompt (e.g. waitlist-crypto-investor)' }]} examples={[{ command: 'sh1pt iterate agents talk claude --recipe waitlist-crypto-investor' }]} />
          <CommandBlock
            signature="sh1pt iterate agents generate"
            description="Generate a new project from a recipe (one-shot, non-interactive)."
            options={[
              { flag: '--agent', description: 'claude | codex | qwen' },
              { flag: '--recipe <id>', description: 'e.g. waitlist-crypto-investor' },
              { flag: '--boilerplate <id>', description: 'next-supabase | expo-supabase | tauri-supabase | chrome-ext-react | bun-hono-supabase' },
              { flag: '--out <dir>', description: 'output directory (default: ./generated)' },
            ]}
            examples={[{ command: 'sh1pt iterate agents generate --recipe waitlist-crypto-investor --boilerplate next-supabase --out ./my-app' }]}
          />
        </div>
      </section>

      {/* ---------------- login ---------------- */}
      <section id="login">
        <div className="container">
          <h2>login</h2>
          <CommandBlock
            signature="sh1pt login"
            description="Authenticate with sh1pt cloud (device-code flow). Token is written to ~/.sh1pt/credentials. Self-host core works without an account; cloud features need it."
            examples={[{ command: 'sh1pt login' }]}
          />
        </div>
      </section>

      {/* ---------------- secret ---------------- */}
      <section id="secret">
        <div className="container">
          <h2>secret</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            Cloud-vaulted credentials per project. sh1pt prompts on first need and stores in the encrypted vault — no <code>.env</code> juggling.
          </p>
          <CommandBlock signature="sh1pt secret set <key> [value]" description="Set a secret (value prompted if omitted)." examples={[{ command: 'sh1pt secret set OPENAI_API_KEY' }]} />
          <CommandBlock signature="sh1pt secret get <key>" description="Print a secret (requires interactive confirmation)." examples={[{ command: 'sh1pt secret get OPENAI_API_KEY' }]} />
          <CommandBlock signature="sh1pt secret list" description="List secret keys (never values)." examples={[{ command: 'sh1pt secret list' }]} />
          <CommandBlock signature="sh1pt secret rm <key>" description="Delete a secret." examples={[{ command: 'sh1pt secret rm OPENAI_API_KEY' }]} />
        </div>
      </section>

      {/* ---------------- config ---------------- */}
      <section id="config">
        <div className="container">
          <h2>config</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            Read + edit <code>sh1pt.config.ts</code> from the CLI without opening the file.
          </p>

          <CommandBlock signature="sh1pt config show" description="Print the resolved (merged with defaults) manifest." examples={[{ command: 'sh1pt config show --json' }]} />

          <h3 style={{ marginTop: '2.5rem' }}>config payments</h3>
          <CommandBlock signature="sh1pt config payments list" description="Show enabled providers and which is the default." examples={[{ command: 'sh1pt config payments list' }]} />
          <CommandBlock signature="sh1pt config payments add <provider>" description="Enable a provider." options={[{ flag: '--default', description: 'also set as defaultProvider' }]} examples={[{ command: 'sh1pt config payments add payment-stripe --default' }]} />
          <CommandBlock signature="sh1pt config payments remove <provider>" description="Disable a provider (keeps it configured but enabled: false)." examples={[{ command: 'sh1pt config payments remove payment-paypal' }]} />
          <CommandBlock signature="sh1pt config payments default <provider>" description="Set the default payment provider." examples={[{ command: 'sh1pt config payments default payment-coinpay' }]} />
          <CommandBlock signature="sh1pt config payments fee <bps>" description="Platform fee in basis points (1500 = 15%, marketplace boilerplates)." examples={[{ command: 'sh1pt config payments fee 1500' }]} />

          <h3 style={{ marginTop: '2.5rem' }}>config stack</h3>
          <CommandBlock signature="sh1pt config stack list" description="Supported and planned stacks." examples={[{ command: 'sh1pt config stack list' }]} />
          <CommandBlock signature="sh1pt config stack set [stack]" description="Set the stack — node | bun | python | rust | custom. Prompts if omitted." examples={[{ command: 'sh1pt config stack set bun' }]} />
          <CommandBlock signature="sh1pt config stack detect" description="Auto-detect from package.json / pyproject.toml / Cargo.toml / *.csproj / CMakeLists.txt." examples={[{ command: 'sh1pt config stack detect' }]} />

          <h3 style={{ marginTop: '2.5rem' }}>config vcs</h3>
          <CommandBlock signature="sh1pt config vcs set [provider]" description="Pick a VCS provider — vcs-github | vcs-gitlab | vcs-gitea | none. Prompts if omitted." examples={[{ command: 'sh1pt config vcs set vcs-github' }]} />
          <CommandBlock signature="sh1pt config vcs auth" description="Walk through setting GITHUB_TOKEN / GITLAB_TOKEN / GITEA_TOKEN in the vault." examples={[{ command: 'sh1pt config vcs auth --provider vcs-github' }]} />
          <CommandBlock
            signature="sh1pt config vcs release <tag>"
            description="Create a release from current HEAD with optional asset uploads."
            options={[
              { flag: '--name <text>', description: 'release name' },
              { flag: '--body <path>', description: 'markdown release notes' },
              { flag: '--draft / --prerelease', description: 'release flags' },
              { flag: '--asset <path...>', description: 'files to attach' },
            ]}
            examples={[{ command: 'sh1pt config vcs release v1.0.0 --name "v1.0.0" --body ./CHANGELOG.md --asset ./dist/sh1pt.tgz' }]}
          />
          <CommandBlock signature="sh1pt config vcs pr" description="Open a PR/MR from a branch (used by iterate to file agent changes)." options={[{ flag: '--head', description: 'source branch' }, { flag: '--base', description: 'target (default: main)' }, { flag: '--title', description: 'PR title' }, { flag: '--body <path>', description: 'PR body file' }, { flag: '--draft', description: 'open as draft' }]} examples={[{ command: 'sh1pt config vcs pr --head agent/copy-tweaks --title "Tighten hero copy"' }]} />
          <CommandBlock signature="sh1pt config vcs hook add" description="Register a webhook from the VCS provider → sh1pt cloud." examples={[{ command: 'sh1pt config vcs hook add --events push,pull_request,release' }]} />

          <h3 style={{ marginTop: '2.5rem' }}>config webhooks</h3>
          <CommandBlock signature="sh1pt config webhooks add <target>" description="Register a webhook target (discord, slack, telegram, teams, generic). Walks the adapter's setup flow." options={[{ flag: '--events <csv>', description: 'which events fire this target (default: *)' }, { flag: '--name <label>', description: 'friendly name' }]} examples={[{ command: 'sh1pt config webhooks add discord' }]} />
          <CommandBlock signature="sh1pt config webhooks remove <target>" description="Disable a webhook target." examples={[{ command: 'sh1pt config webhooks remove discord' }]} />
          <CommandBlock signature="sh1pt config webhooks test <target>" description="Fire a stub event at a registered target." examples={[{ command: 'sh1pt config webhooks test slack --event ship.published' }]} />
          <CommandBlock signature="sh1pt config webhooks list" description="All configured outbound targets + subscription URLs." examples={[{ command: 'sh1pt config webhooks list --json' }]} />
          <CommandBlock signature="sh1pt config webhooks sub add <url>" description="Subscribe an external URL to sh1pt events (HMAC-signed POSTs)." options={[{ flag: '--events <csv>', description: 'event names or * (default: *)' }, { flag: '--description <text>', description: 'human label' }]} examples={[{ command: 'sh1pt config webhooks sub add https://example.com/hooks/sh1pt --events ship.published,ship.rolled-back' }]} />
          <CommandBlock signature="sh1pt config webhooks sub remove <subscriptionId>" description="Remove a subscription." examples={[{ command: 'sh1pt config webhooks sub remove sub_abc123' }]} />
        </div>
      </section>

      {/* ---------------- skills ---------------- */}
      <section id="skills">
        <div className="container">
          <h2>skills</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            Package and promote SKILL.md agent skills across marketplaces (uGig, ClawHub, skills.sh, LobeHub, Goose, Kilo, AI Skillstore, FreeMyGent, ClawMart, Manus, VS Code Agent Skills, Moltbook, AgentHub).
          </p>
          <CommandBlock
            signature="sh1pt skills new"
            description="Create sh1pt.skill.json metadata for a SKILL.md (alias: sh1pt skills create)."
            options={[
              { flag: '--skill-file <path>', description: 'path to SKILL.md (default: ./SKILL.md)' },
              { flag: '--out <path>', description: 'manifest output (default: ./sh1pt.skill.json)' },
              { flag: '--name / --title / --description / --tagline', description: 'listing metadata' },
              { flag: '--category <name>', description: 'default: Automation' },
              { flag: '--tags <csv>', description: 'default: skills,automation' },
              { flag: '--price <sats>', description: '0 = free' },
              { flag: '--source-url <url>', description: 'public raw SKILL.md or repo URL' },
            ]}
            examples={[{ command: 'sh1pt skills new --skill-file ./SKILL.md --title "PR triage" --price 0' }]}
          />
          <CommandBlock
            signature="sh1pt skills publish"
            description="Publish (or print marketplace publish steps) for a skill."
            options={[
              { flag: '--manifest <path>', description: 'default: ./sh1pt.skill.json' },
              { flag: '--marketplace <id...>', description: 'specific marketplace ids' },
              { flag: '--all', description: 'every known marketplace' },
              { flag: '--dry-run', description: 'print actions without invoking CLIs' },
            ]}
            examples={[{ command: 'sh1pt skills publish --all --dry-run' }]}
          />
          <CommandBlock signature="sh1pt skills marketplaces" description="List known skill marketplaces and their publish methods." examples={[{ command: 'sh1pt skills marketplaces' }]} />
        </div>
      </section>

      {/* ---------------- self ---------------- */}
      <section id="self">
        <div className="container">
          <h2>self-management</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            sh1pt detects how it was installed (pnpm / bun / aube / npm / deno) and shells out to the same package manager.
          </p>
          <CommandBlock signature="sh1pt update" description="Update sh1pt to the latest release. Alias: sh1pt upgrade." examples={[{ command: 'sh1pt update' }]} />
          <CommandBlock signature="sh1pt remove" description="Uninstall sh1pt. Alias: sh1pt uninstall. Prompts before deleting ~/.config/sh1pt/." options={[{ flag: '--keep-config', description: 'keep ~/.config/sh1pt/ (config + vault)' }]} examples={[{ command: 'sh1pt remove --keep-config' }]} />
        </div>
      </section>

      {/* ---------------- adapters ---------------- */}
      <section id="adapters">
        <div className="container">
          <h2>Adapter commands</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            Every adapter category gets a top-level command that mirrors the filesystem under <code>packages/&lt;category&gt;/&lt;name&gt;/</code>. Two subcommands per adapter — <code>setup</code> (lazy-imports the npm package and runs its setup flow, persisting to <code>~/.config/sh1pt/config.json</code>) and <code>info</code> (shows what the CLI knows without loading the package). Adapters are optional dependencies; missing packages print an install hint instead of crashing.
          </p>

          <div style={{ display: 'grid', gap: '0.75rem', maxWidth: 760 }}>
            <CopyableCommand label="List adapters in a category" command="sh1pt <category> list" />
            <CopyableCommand label="Run an adapter's setup" command="sh1pt <category> <name> setup" />
            <CopyableCommand label="Inspect an adapter" command="sh1pt <category> <name> info" />
            <CopyableCommand label="Install a missing adapter" command="pnpm add -g @profullstack/sh1pt-<prefix>-<name>" />
          </div>

          <h3 style={{ marginTop: '2.5rem' }}>Categories</h3>
          <div className="grid grid-3">
            {[
              ['agents', 'AI coding CLIs', 'claude · codex · qwen'],
              ['bots', 'Chat bots', 'discord · slack · telegram · signal · matrix · whatsapp · twilio · telnyx · twitch · wechat · irc · phonenumbers · teams'],
              ['bridges', 'Cross-network chat bridges', 'discord · irc · mastodon · matrix · nostr · signal · slack · telegram'],
              ['captcha', 'CAPTCHA solvers (browser-mode fallback)', '2captcha · captchasolver'],
              ['cloud', 'Raw-compute providers', 'atlantic · cloudflare · digitalocean · firebase · fly · hetzner · nvidia · railway · runpod · supabase · vultr'],
              ['observability', 'Release tracking + telemetry', 'sentry'],
              ['dns', 'DNS providers', 'cloudflare · porkbun'],
              ['secrets', 'Secrets CLIs', 'doppler · dotenvx · 1password'],
              ['security', 'Security scanning', 'snyk'],
              ['docs', 'Doc/deck generators', 'marp · gslides · pandoc · lumin'],
              ['entity', 'Jurisdiction packs', 'us-delaware · us · nz · uk · hk · au · stub · …'],
              ['merch', 'Print-on-demand', 'printful · printify'],
              ['outreach', 'Email + podcast + launch outreach', 'resend · listennotes · producthunt · …'],
              ['payments', 'Payment providers', 'coinpay · stripe · paypal · worldremit · …'],
              ['promo', 'Ad networks + fundraising', 'meta · reddit · tiktok · google · linkedin · capitalreach · wefunder · kickstarter · …'],
              ['recipes', 'Composed app recipes', 'waitlist-crypto-investor · …'],
              ['social', 'Organic social', 'x · linkedin · bluesky · mastodon · tiktok · reddit · youtube · threads · …'],
              ['targets', 'Distribution targets', 'pkg-npm · pkg-homebrew · pkg-docker · pkg-jsr · pkg-aur · pkg-nix · pkg-snap · pkg-flatpak · pkg-fdroid · pkg-winget · pkg-scoop · pkg-apt · web-static · mobile-ios · mobile-android · mobile-expo · desktop-mac · desktop-win · desktop-linux · console-steam · tv-roku · tv-tvos · tv-firetv · tv-androidtv · tv-webos · xr-meta-quest · xr-pico · xr-visionos · xr-webxr · xr-steamvr · xr-sidequest · browser-chrome · browser-firefox · browser-edge · browser-safari · plugin-vscode · plugin-jetbrains · chat-discord · chat-slack · chat-telegram · chat-signal · chat-whatsapp · deploy-vercel · deploy-netlify · deploy-railway · deploy-fly · deploy-render · deploy-firebase · deploy-workers · deploy-denodeploy'],
              ['vcs', 'Version control', 'github · gitlab · gitea'],
              ['webhooks', 'Webhook targets', 'discord · slack · teams · telegram · generic'],
            ].map(([id, summary, examples]) => (
              <div key={id} className="card">
                <div style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontWeight: 700, marginBottom: '0.4rem' }}>
                  sh1pt <span style={{ color: 'var(--accent)' }}>{id}</span>
                </div>
                <div className="muted" style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>{summary}</div>
                <div className="muted" style={{ fontSize: '0.8rem', wordBreak: 'break-word' }}>{examples}</div>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: '2.5rem' }}>Examples</h3>
          <div style={{ display: 'grid', gap: '0.75rem', maxWidth: 760 }}>
            <CopyableCommand label="Connect Discord bot credentials" command="sh1pt bots discord setup" />
            <CopyableCommand label="See what's known about deploy-vercel" command="sh1pt targets deploy-vercel info" />
            <CopyableCommand label="List every cloud provider adapter" command="sh1pt cloud list" />
            <CopyableCommand label="Wire a generic webhook target" command="sh1pt webhooks generic setup" />
          </div>
        </div>
      </section>
    </main>
  );
}
