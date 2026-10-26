import { randomUUID } from 'node:crypto';
import type { Property, PropertyInput, PropertyQuery } from '../domain/property.js';

/** Development adapter only: replace with a durable database adapter before production. */
export class PropertyRepository {
  private readonly records = new Map<string, Property>();
  list(q: PropertyQuery) {
    const needle = q.search?.toLocaleLowerCase();
    const matches = [...this.records.values()].filter(p =>
      (!q.city || p.city.toLocaleLowerCase() === q.city.toLocaleLowerCase()) &&
      (!q.propertyType || p.propertyType === q.propertyType) &&
      (!q.transactionType || p.transactionType === q.transactionType) &&
      (q.minPrice === undefined || p.price >= q.minPrice) &&
      (q.maxPrice === undefined || p.price <= q.maxPrice) &&
      (!needle || `${p.title} ${p.description} ${p.city}`.toLocaleLowerCase().includes(needle))
    ).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    const start = (q.page - 1) * q.limit;
    return { items: matches.slice(start, start + q.limit), total: matches.length, page: q.page, limit: q.limit };
  }
  getById(id: string) { return this.records.get(id); }
  create(input: PropertyInput): Property {
    const now = new Date().toISOString();
    const record: Property = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
    this.records.set(record.id, record);
    return record;
  }
  clear() { this.records.clear(); }
}
