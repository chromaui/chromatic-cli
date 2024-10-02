import dns from 'dns';
import { Agent, AgentOptions } from 'https';

/**
 * A DNS resolver for interacting with a custom DNS server, if provided.
 */
export class DNSResolveAgent extends Agent {
  constructor(options: AgentOptions = {}) {
    super({
      ...options,
      lookup(
        hostname: string,
        _options: dns.LookupOptions,
        callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
      ) {
        dns.resolve(hostname, (err, addresses) => callback(err, addresses?.[0], 4));
      },
    });
  }
}

const getDNSResolveAgent = () => new DNSResolveAgent();

export default getDNSResolveAgent;
