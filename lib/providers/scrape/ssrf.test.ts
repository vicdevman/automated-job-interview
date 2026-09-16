import { describe, it, expect } from 'vitest';
import { isPrivateAddress } from './readability';

/**
 * PRD §8.6 — "block private IP ranges and localhost to prevent SSRF".
 *
 * The candidate supplies these URLs and we fetch them from inside our own
 * infrastructure, so this is the control that stops a portfolio URL being used
 * to read the cloud metadata service.
 */
describe('isPrivateAddress', () => {
  it('blocks loopback', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('127.99.1.2')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
  });

  it('blocks the cloud metadata endpoint', () => {
    // The single most valuable SSRF target on any cloud host.
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
  });

  it('blocks RFC1918 ranges', () => {
    expect(isPrivateAddress('10.0.0.1')).toBe(true);
    expect(isPrivateAddress('172.16.0.1')).toBe(true);
    expect(isPrivateAddress('172.31.255.254')).toBe(true);
    expect(isPrivateAddress('192.168.1.1')).toBe(true);
  });

  it('allows public addresses that merely look similar', () => {
    // 172.15 and 172.32 are outside the private block.
    expect(isPrivateAddress('172.15.0.1')).toBe(false);
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
    expect(isPrivateAddress('192.167.1.1')).toBe(false);
    expect(isPrivateAddress('11.0.0.1')).toBe(false);
  });

  it('blocks carrier-grade NAT and 0.0.0.0', () => {
    expect(isPrivateAddress('100.64.0.1')).toBe(true);
    expect(isPrivateAddress('0.0.0.0')).toBe(true);
  });

  it('blocks multicast and reserved space', () => {
    expect(isPrivateAddress('224.0.0.1')).toBe(true);
    expect(isPrivateAddress('255.255.255.255')).toBe(true);
  });

  it('blocks IPv6 unique-local and link-local', () => {
    expect(isPrivateAddress('fd00::1')).toBe(true);
    expect(isPrivateAddress('fc00::1')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
  });

  it('unwraps IPv4-mapped IPv6 rather than waving it through', () => {
    // ::ffff:127.0.0.1 is loopback wearing a costume.
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:169.254.169.254')).toBe(true);
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false);
  });

  it('allows genuine public addresses', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('1.1.1.1')).toBe(false);
    expect(isPrivateAddress('102.89.32.1')).toBe(false); // a Nigerian ISP range
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('fails closed on malformed input', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true);
    expect(isPrivateAddress('1.2.3')).toBe(true);
    expect(isPrivateAddress('')).toBe(true);
  });
});
