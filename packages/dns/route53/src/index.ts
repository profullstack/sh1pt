import { defineDns, type DnsRecord } from '@profullstack/sh1pt-core';

// AWS Route 53 DNS. Auth: AWS IAM credentials (Access Key + Secret).
// sh1pt uses the AWS SDK v3 @aws-sdk/client-route-53 under the hood
// but exposes only the credentials — no SDK runtime is bundled here.
// REST wire format for reference only; real calls go through the SDK.
//
// Key concepts:
//   - Hosted Zone ID (e.g. Z1234567890) identifies a domain
//   - ALIAS record: a Route 53 extension to the DNS standard that lets
//     the zone apex (bare domain) point to AWS resources or other zones
//   - ChangeBatch: atomic batch of CREATE/DELETE/UPSERT actions
interface Config {
  region?: string;  // e.g. 'us-east-1' (Route 53 is global but SDK needs a region)
  defaultTtl?: number;
}

let _secret: (k: string) => string | undefined = () => undefined;

export default defineDns<Config>({
  id: 'dns-route53',
  label: 'AWS Route 53',

  async connect(ctx) {
    _secret = (k) => ctx.secret(k);
    if (!ctx.secret('AWS_ACCESS_KEY_ID') || !ctx.secret('AWS_SECRET_ACCESS_KEY')) {
      throw new Error('AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY not set — run `sh1pt secret set AWS_ACCESS_KEY_ID ...` (required)');
    }
    return { accountId: 'route53' };
  },

  async listZones() {
    // TODO: use @aws-sdk/client-route-53 Route53Client + ListHostedZonesCommand
    // const client = new Route53Client({ region: 'us-east-1', credentials: {
    //   accessKeyId: _secret('AWS_ACCESS_KEY_ID') ?? '',
    //   secretAccessKey: _secret('AWS_SECRET_ACCESS_KEY') ?? '',
    // }});
    // const { HostedZones } = await client.send(new ListHostedZonesCommand({}));
    // return HostedZones.map(z => ({ id: z.Id.replace('/hostedzone/', ''), name: z.Name }));
    return [];
  },

  async listRecords(_zoneId) {
    // TODO: ListResourceRecordSetsCommand({ HostedZoneId: zoneId })
    // Map RRSets to DnsRecord[]. ALIAS records map to type 'CNAME' with value = AliasTarget.DNSName.
    return [];
  },

  async upsertRecord(zoneId, record, config) {
    // TODO: ChangeResourceRecordSetsCommand with ChangeBatch Action=UPSERT
    const ttl = record.ttl ?? config.defaultTtl ?? 300;
    return { id: 'r53-stub', ...record, zone: zoneId, ttl };
  },

  async deleteRecord(_zoneId, _recordId) {
    // TODO: ChangeResourceRecordSetsCommand with ChangeBatch Action=DELETE
    // Need to fetch the full RRSet first (name+type are required for DELETE).
  },

  async syncRoundRobin({ zoneId, name, ips, ttl }, config) {
    // TODO: list existing A records at `name`, diff vs `ips`, upsert/delete.
    // Route 53 round-robins natively — just set multiple A values in one RRSet.
    const ttlFinal = ttl ?? config.defaultTtl ?? 300;
    return ips.map((ip, i) => ({
      id: `r53-stub-${i}`,
      zone: zoneId,
      name,
      type: 'A' as const,
      value: ip,
      ttl: ttlFinal,
    })) satisfies DnsRecord[];
  },
});
