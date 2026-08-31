'use client';

import { IndustryWithOtherField } from '@/components/IndustryWithOtherField';
import {
  SCL_COUNTRY_OPTIONS,
  SCL_JOB_TITLE_OPTIONS,
  SCL_SECURITY_EXPENDITURE_OPTIONS,
  SCL_SITE_COUNT_OPTIONS,
  type ContactDetails,
} from '@/lib/scl-assessment-types';

type Props = {
  details: ContactDetails;
  industryOptions: string[];
  onChange: (next: ContactDetails) => void;
};

function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor}>
      {children}
      {required ? <em className="scl-exec-req"> *</em> : null}
    </label>
  );
}

export function AssessmentContactForm({ details, industryOptions, onChange }: Props) {
  const set = (patch: Partial<ContactDetails>) => onChange({ ...details, ...patch });
  return (
    <div className="scl-exec-fields">
      <div className="scl-exec-field">
        <FieldLabel htmlFor="scl-first" required>
          First name
        </FieldLabel>
        <input
          id="scl-first"
          value={details.firstName}
          onChange={(e) => set({ firstName: e.target.value })}
          autoComplete="given-name"
        />
      </div>
      <div className="scl-exec-field">
        <FieldLabel htmlFor="scl-last" required>
          Last name
        </FieldLabel>
        <input
          id="scl-last"
          value={details.lastName}
          onChange={(e) => set({ lastName: e.target.value })}
          autoComplete="family-name"
        />
      </div>

      <div className="scl-exec-field">
        <FieldLabel htmlFor="scl-email" required>
          Work email
        </FieldLabel>
        <input
          id="scl-email"
          type="email"
          value={details.email}
          onChange={(e) => set({ email: e.target.value })}
          autoComplete="email"
        />
      </div>
      <div className="scl-exec-field">
        <FieldLabel htmlFor="scl-phone">Contact number</FieldLabel>
        <input
          id="scl-phone"
          value={details.phone}
          onChange={(e) => set({ phone: e.target.value })}
          autoComplete="tel"
        />
      </div>

      <div className="scl-exec-field">
        <FieldLabel htmlFor="scl-company" required>
          Organisation
        </FieldLabel>
        <input
          id="scl-company"
          value={details.organisationName}
          onChange={(e) => set({ organisationName: e.target.value })}
          autoComplete="organization"
        />
      </div>
      <div className="scl-exec-field">
        <FieldLabel htmlFor="scl-role" required>
          Job title
        </FieldLabel>
        <IndustryWithOtherField
          id="scl-role"
          options={[...SCL_JOB_TITLE_OPTIONS]}
          value={details.role}
          placeholder="Select job title"
          otherLabel="Please specify job title"
          otherPlaceholder="Enter job title"
          onChange={(role) => set({ role })}
        />
      </div>

      <div className="scl-exec-field">
        <FieldLabel htmlFor="scl-country" required>
          Country or region
        </FieldLabel>
        <select
          id="scl-country"
          className={details.country ? 'has-value' : undefined}
          value={details.country}
          onChange={(e) => set({ country: e.target.value })}
        >
          <option value="">Select country</option>
          {SCL_COUNTRY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="scl-exec-field">
        <FieldLabel>Industry</FieldLabel>
        <IndustryWithOtherField
          options={industryOptions}
          value={details.industry}
          placeholder="Select industry"
          onChange={(industry) => set({ industry })}
        />
      </div>

      <div className="scl-exec-field">
        <FieldLabel htmlFor="scl-sites" required>
          Operational sites
        </FieldLabel>
        <select
          id="scl-sites"
          className={details.totalSites ? 'has-value' : undefined}
          value={details.totalSites}
          onChange={(e) => set({ totalSites: e.target.value })}
        >
          <option value="">Select range</option>
          {SCL_SITE_COUNT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="scl-exec-field">
        <FieldLabel htmlFor="scl-spend" required>
          Estimated annual security expenditure
        </FieldLabel>
        <select
          id="scl-spend"
          className={details.securityExpenditure ? 'has-value' : undefined}
          value={details.securityExpenditure}
          onChange={(e) => set({ securityExpenditure: e.target.value })}
        >
          <option value="">Select range</option>
          {SCL_SECURITY_EXPENDITURE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="scl-exec-field scl-exec-wide">
        <FieldLabel htmlFor="scl-concern">Primary concern or context</FieldLabel>
        <textarea
          id="scl-concern"
          className="scl-exec-textarea"
          rows={4}
          value={details.primaryConcern}
          onChange={(e) => set({ primaryConcern: e.target.value })}
        />
      </div>
    </div>
  );
}
