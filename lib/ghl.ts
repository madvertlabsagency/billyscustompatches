// Minimal GoHighLevel API v2 client (Private Integration token).

export const GHL_FIELDS = [
  'RFQ ID',
  'RFQ Patch Type',
  'RFQ Quantity',
  'RFQ Width',
  'RFQ Height',
  'RFQ Backing',
  'RFQ Deadline',
  'RFQ Preferred Contact Method',
  'RFQ Project Notes',
  'RFQ Artwork URL',
  'RFQ Quote PDF URL',
  'RFQ Landing Page',
  'RFQ UTM Source',
  'RFQ UTM Medium',
  'RFQ UTM Campaign',
  'RFQ UTM Content',
  'RFQ FBCLID',
  'RFQ Meta Campaign ID',
  'RFQ Meta Ad Set ID',
  'RFQ Meta Ad ID',
  'RFQ Submitted At',
  'RFQ Lead Score',
  'RFQ Lead Grade',
  'RFQ WhatsApp Verified',
  'RFQ Verify Code',
  'RFQ WhatsApp Link',
  'RFQ Summary',
] as const;
export type GhlFieldName = (typeof GHL_FIELDS)[number];

const LARGE_TEXT = new Set<GhlFieldName>(['RFQ Project Notes', 'RFQ Artwork URL', 'RFQ Landing Page']);

export class GhlError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) {
    super(message);
  }
}

export class GhlSetupError extends Error {}

type Fetch = typeof fetch;

export type GhlContact = { id: string; tags?: string[] };

export class Ghl {
  private fieldIds: Map<string, string> | null = null;

  constructor(
    private token: string,
    private locationId: string,
    private base = 'https://services.leadconnectorhq.com',
    private fetcher: Fetch = fetch,
  ) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetcher(this.base + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Version: '2021-07-28',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      throw new GhlError(`GHL ${method} ${path} failed ${res.status}: ${text.slice(0, 300)}`, res.status, retryable);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  async findContact(email: string, phone: string): Promise<GhlContact | null> {
    const q = (k: string, v: string) =>
      this.call<{ contact?: GhlContact | null }>(
        'GET',
        `/contacts/search/duplicate?locationId=${encodeURIComponent(this.locationId)}&${k}=${encodeURIComponent(v)}`,
      );
    const byEmail = email ? await q('email', email) : {};
    if (byEmail.contact?.id) return byEmail.contact;
    const byPhone = phone ? await q('number', phone) : {};
    return byPhone.contact?.id ? byPhone.contact : null;
  }

  async createContact(data: Record<string, unknown>): Promise<string> {
    const r = await this.call<{ contact: { id: string } }>('POST', '/contacts/', { ...data, locationId: this.locationId });
    return r.contact.id;
  }

  async updateContact(id: string, data: Record<string, unknown>): Promise<void> {
    await this.call('PUT', `/contacts/${id}`, data);
  }

  async addTags(id: string, tags: string[]): Promise<void> {
    if (tags.length) await this.call('POST', `/contacts/${id}/tags`, { tags });
  }

  async removeTags(id: string, tags: string[]): Promise<void> {
    if (tags.length) await this.call('DELETE', `/contacts/${id}/tags`, { tags });
  }

  async addNote(id: string, body: string): Promise<void> {
    await this.call('POST', `/contacts/${id}/notes`, { body });
  }

  // Returns field name -> id, creating any missing RFQ fields.
  async ensureFields(): Promise<Map<string, string>> {
    if (this.fieldIds) return this.fieldIds;
    const r = await this.call<{ customFields: { id: string; name: string }[] }>(
      'GET',
      `/locations/${this.locationId}/customFields?model=contact`,
    );
    const map = new Map<string, string>();
    for (const f of r.customFields || []) map.set(f.name, f.id);
    for (const name of GHL_FIELDS) {
      if (map.has(name)) continue;
      const c = await this.call<{ customField: { id: string } }>('POST', `/locations/${this.locationId}/customFields`, {
        name,
        dataType: LARGE_TEXT.has(name) ? 'LARGE_TEXT' : 'TEXT',
        model: 'contact',
      });
      map.set(name, c.customField.id);
    }
    this.fieldIds = map;
    return map;
  }

  async findPipeline(pipelineName: string, stageName: string): Promise<{ pipelineId: string; stageId: string }> {
    const r = await this.call<{ pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[] }>(
      'GET',
      `/opportunities/pipelines?locationId=${encodeURIComponent(this.locationId)}`,
    );
    const p = (r.pipelines || []).find((x) => x.name.trim().toLowerCase() === pipelineName.toLowerCase());
    if (!p) throw new GhlSetupError(`Create the pipeline "${pipelineName}" in GHL (Opportunities, Pipelines).`);
    const s = p.stages.find((x) => x.name.trim().toLowerCase() === stageName.toLowerCase());
    if (!s) throw new GhlSetupError(`Add a stage named "${stageName}" to the pipeline "${pipelineName}" in GHL.`);
    return { pipelineId: p.id, stageId: s.id };
  }

  async createOpportunity(data: {
    pipelineId: string;
    stageId: string;
    name: string;
    contactId: string;
    assignedTo?: string;
  }): Promise<string> {
    const r = await this.call<{ opportunity: { id: string } }>('POST', '/opportunities/', {
      locationId: this.locationId,
      pipelineId: data.pipelineId,
      pipelineStageId: data.stageId,
      name: data.name,
      status: 'open',
      contactId: data.contactId,
      ...(data.assignedTo ? { assignedTo: data.assignedTo } : {}),
    });
    return r.opportunity.id;
  }

  // emailFrom, e.g. "Billys Custom Patches <quotes@billyscustompatches.com>", sets the sender name and address.
  // If GHL rejects it (sending domain not set up yet), the email is sent again with the default sender.
  async sendEmail(contactId: string, subject: string, html: string, attachments: string[] = [], emailFrom = ''): Promise<void> {
    const body = { type: 'Email', contactId, subject, html, ...(attachments.length ? { attachments } : {}) };
    if (emailFrom) {
      try {
        await this.call('POST', '/conversations/messages', { ...body, emailFrom });
        return;
      } catch (e) {
        console.error('GHL email with custom sender failed, retrying with default sender', e);
      }
    }
    await this.call('POST', '/conversations/messages', body);
  }

  async sendWhatsApp(contactId: string, message: string, attachments: string[] = []): Promise<void> {
    await this.call('POST', '/conversations/messages', {
      type: 'WhatsApp',
      contactId,
      message,
      ...(attachments.length ? { attachments } : {}),
    });
  }
}
