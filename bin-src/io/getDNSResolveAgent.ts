import dns from 'dns';
import { Agent, AgentOptions } from 'https';

export class DNSResolveAgent extends Agent {
  constructor(options: AgentOptions = {}) {
    super({
      ...options,
      lookup(
        hostname: string,
        lookupOptions: dns.LookupOneOptions,
        callback: (err: NodeJS.ErrnoException, address: string, family: number) => void
      ) {
        dns.resolve(hostname, (err, addresses) => callback(err, addresses?.[0], 4));
      },
    });
  }
}

const getDNSResolveAgent = () => new DNSResolveAgent();

export default getDNSResolveAgent;
