import PDFDocument from 'pdfkit';
import { formatProposalMoney } from './proposal-fee-calculations';
import {
  beginMajorSection,
  beginScopeObjectivesSlide,
  bodyText,
  clearPdfTextState,
  createProposalChrome,
  currentPageIndex,
  drawAcceptanceBlock,
  drawContentsPage,
  drawCoverPage,
  drawPhaseMatrix,
  drawProposalFooter,
  drawProposedTimelineTable,
  drawScopeAndObjectivesSlide,
  drawProposedTeamSection,
  drawTableHeader,
  drawTableRow,
  drawTeamStructure,
  drawTimelineIntro,
  ensureProposalSpace,
  markProposalBodyContent,
  paintContentsPageBackground,
  PROPOSAL_MARGIN,
  PROPOSAL_PAGE_HEIGHT,
  PROPOSAL_PAGE_WIDTH,
  resetProposalPageTracker,
  reserveContentsPage,
  sectionTitle,
  startBodyPages,
  trimToTrackedContentPages,
} from './proposal-pdf-chrome';
import { stripHtmlToPlain } from './proposal-rich-text';
import {
  normalizeTimelineRows,
  resolveGanttMaxWeeks,
} from './proposal-timeline';
import {
  resolveProposalSectionHeading,
  type PhysicalRiskProposalInput,
  type ProposalSectionHeadingKey,
} from './proposal-template-types';

/** Auto rates sentence (any amount/currency) — PDF should use live rates instead. */
function isAutoFeesIntroduction(value: string | null | undefined): boolean {
  const plain = stripHtmlToPlain(String(value || ''))
    .replace(/\u00a0/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!plain) return true;
  return (
    plain.startsWith('the costs below are estimated on a time-and-materials basis')
    && plain.includes('analyst rate:')
    && plain.includes('specialist rate:')
  );
}

function resolveFeesIntroduction(input: PhysicalRiskProposalInput): string {
  const raw = String(input.content.feesIntroduction || '').trim();
  if (raw && !isAutoFeesIntroduction(raw)) return raw;
  return `The costs below are estimated on a time-and-materials basis. Analyst rate: ${formatProposalMoney(input.analystHourlyRate, input.currency)} per hour. Specialist rate: ${formatProposalMoney(input.specialistHourlyRate, input.currency)} per hour.`;
}
const CONTENT_W = PROPOSAL_PAGE_WIDTH - PROPOSAL_MARGIN * 2;
const CONTENTS_PAGE_INDEX = 1;

type TocEntry = { title: string; page: number; indent?: boolean };

function phaseBulletLinesFromText(value: string): string[] {
  const plain = stripHtmlToPlain(String(value || ''))
    .replace(/\r\n/g, '\n')
    .trim();
  if (!plain) return [];
  return plain
    .split(/\n+/)
    .map((line) => line.replace(/^[•●▪◦\-\u2013\u2014*]\s*/, '').trim())
    .filter(Boolean);
}

function padPhases(input: PhysicalRiskProposalInput) {
  const phases = [...input.content.phases.slice(0, 3)];
  while (phases.length < 3) {
    phases.push({
      sequence: phases.length + 1,
      name: '—',
      keyActivities: '',
      deliverables: '',
    });
  }
  return phases;
}

export function renderPhysicalRiskProposalPdf(input: PhysicalRiskProposalInput): Promise<Buffer> {
  const chrome = createProposalChrome();
  const toc: TocEntry[] = [];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PROPOSAL_PAGE_WIDTH, PROPOSAL_PAGE_HEIGHT],
      margin: PROPOSAL_MARGIN,
      bufferPages: true,
      info: {
        Title: `Project Proposal — ${input.clientCompany}`,
        Author: chrome.brandName,
        Subject: input.proposalTitle,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(Buffer.from(c)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    resetProposalPageTracker(0);

    // Cover
    drawCoverPage(doc, chrome, {
      proposalTitle: input.proposalTitle,
      productCode: input.productCode,
      proposalSubtitle: input.proposalSubtitle,
      clientCompany: input.clientCompany,
      clientContact: input.clientContact,
      clientPosition: input.clientPosition,
      clientEmail: input.clientEmail,
      clientPhone: input.clientPhone,
      proposalNumber: input.proposalNumber,
      proposalDate: input.proposalDate,
      proposalVersion: input.proposalVersion,
    });

    // Reserved contents page (filled in after body pagination is known).
    reserveContentsPage(doc);
    startBodyPages(doc, chrome);

    const mark = (title: string, opts: { indent?: boolean } = {}) => {
      toc.push({ title, page: currentPageIndex(doc), indent: opts.indent });
    };
    const heading = (key: ProposalSectionHeadingKey) =>
      resolveProposalSectionHeading(input.content.sectionHeadings, key);

    // Optional Overview introduction (legacy letter) — only when admin provided text
    const introduction = String(input.proposalIntroduction || '').trim();
    if (introduction) {
      beginMajorSection(doc, chrome, heading('introduction'), CONTENT_W);
      mark(heading('introduction'));
      bodyText(doc, chrome, introduction, CONTENT_W);
    }

    // Understanding your needs
    beginMajorSection(doc, chrome, heading('understanding'), CONTENT_W);
    mark(heading('understanding'));
    bodyText(doc, chrome, input.understandingOfNeeds, CONTENT_W, { narrative: true });

    // Scope and objectives — original PPT two-column slide + Security Review diagram
    beginScopeObjectivesSlide(doc, chrome, heading('scope'));
    mark(heading('scope'));
    const exclusionsForScope =
      String(input.exclusions || '').trim()
      || (input.content.projectExclusions || []).join('\n');
    drawScopeAndObjectivesSlide(
      doc,
      chrome,
      {
        scopeObjectives: input.objectives,
        sitesOrBusinessUnits: input.sitesOrBusinessUnits,
        scopeBody: input.scope,
        approach: input.approach,
        exclusions: exclusionsForScope,
      },
      CONTENT_W,
    );

    // Methodology
    beginMajorSection(doc, chrome, heading('methodology'), CONTENT_W, { pageBreak: true });
    mark(heading('methodology'));
    bodyText(doc, chrome, input.methodology, CONTENT_W);
    const methodologyItems = input.content.methodologyItems.filter(
      (row) => row.name?.trim() || row.description?.trim(),
    );
    if (methodologyItems.length) {
      doc.moveDown(0.4);
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(11).text('Total Security Management');
      markProposalBodyContent(doc);
      doc.moveDown(0.25);
      drawTableHeader(doc, [{ label: 'Area', width: 180 }, { label: 'Description', width: CONTENT_W - 180 }], PROPOSAL_MARGIN);
      for (const row of methodologyItems) {
        drawTableRow(
          doc,
          chrome,
          [row.name || '—', row.description || ''],
          [180, CONTENT_W - 180],
          PROPOSAL_MARGIN,
          { boldFirst: true },
        );
      }
    }

    // Approach / phases (PPT coloured matrix)
    beginMajorSection(doc, chrome, heading('approach'), CONTENT_W, { pageBreak: true });
    mark(heading('approach'));
    // Prefer Scope-tab exclusions text; fall back to structured content exclusions
    const exclusionFromScope = phaseBulletLinesFromText(input.exclusions);
    const exclusionItems = exclusionFromScope.length
      ? exclusionFromScope
      : input.content.projectExclusions;
    drawPhaseMatrix(doc, chrome, padPhases(input), CONTENT_W, {
      exclusions: exclusionItems,
    });

    // Detailed approach
    beginMajorSection(doc, chrome, heading('detailedApproach'), CONTENT_W);
    mark(heading('detailedApproach'));
    const detCols = [56, 200, 200, CONTENT_W - 456];
    drawTableHeader(
      doc,
      [
        { label: 'Phase', width: detCols[0] },
        { label: 'Key Activities', width: detCols[1] },
        { label: `Physical Risk / ${input.clientCompany} Role`, width: detCols[2] },
        { label: 'Indicative Output', width: detCols[3] },
      ],
      PROPOSAL_MARGIN,
    );
    for (const phase of input.content.phases) {
      const roleParts = [
        phase.physicalRiskRole?.trim() ? `Physical Risk: ${phase.physicalRiskRole.trim()}` : '',
        phase.clientRole?.trim() ? `${input.clientCompany}: ${phase.clientRole.trim()}` : '',
      ].filter(Boolean);
      drawTableRow(
        doc,
        chrome,
        [
          String(phase.sequence),
          phase.keyActivities,
          roleParts.join('\n') || '—',
          phase.indicativeOutput || phase.deliverables,
        ],
        detCols,
        PROPOSAL_MARGIN,
        { boldFirst: true, minH: 32 },
      );
    }

    // Deliverables (only when configured sections or narrative exists)
    const deliverableSections = input.content.deliverableSections.filter(
      (s) => s.title?.trim() || s.description?.trim(),
    );
    if (deliverableSections.length || input.deliverables.trim()) {
      beginMajorSection(doc, chrome, heading('deliverables'), CONTENT_W);
      mark(heading('deliverables'));
      if (deliverableSections.length) {
        for (const section of deliverableSections) {
          ensureProposalSpace(doc, chrome, 24);
          doc.fillColor('#111').font('Helvetica-Bold').fontSize(10).text(section.title);
          markProposalBodyContent(doc);
          bodyText(doc, chrome, section.description, CONTENT_W);
        }
      } else {
        bodyText(doc, chrome, input.deliverables, CONTENT_W);
      }
    }

    // Admin-invented custom sections (optional extras beyond the fixed deck)
    const customSections = (input.content.customSections || [])
      .filter((s) => String(s.title || '').trim() || String(s.body || '').trim())
      .slice()
      .sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0));
    for (const section of customSections) {
      const title = String(section.title || 'Additional section').trim() || 'Additional section';
      beginMajorSection(doc, chrome, title, CONTENT_W, {
        pageBreak: section.pageBreak !== false,
      });
      mark(title);
      bodyText(doc, chrome, String(section.body || '').trim() || '—', CONTENT_W);
    }

    // Fees — Phase / Description / Analyst / Specialist / Fee
    beginMajorSection(doc, chrome, heading('fees'), CONTENT_W, { pageBreak: true });
    mark(heading('fees'));
    bodyText(doc, chrome, resolveFeesIntroduction(input), CONTENT_W, { fontSize: 9 });
    doc.moveDown(0.45);

    const feeCols = [36, CONTENT_W - 36 - 52 - 70 - 52 - 70 - 90, 52, 70, 52, 70, 90];
    drawTableHeader(
      doc,
      [
        { label: 'Phase', width: feeCols[0] },
        { label: 'Description', width: feeCols[1] },
        { label: 'DA Hrs', width: feeCols[2] },
        { label: 'DA Rate', width: feeCols[3] },
        { label: 'Spec Hrs', width: feeCols[4] },
        { label: 'Spec Rate', width: feeCols[5] },
        { label: 'Fee', width: feeCols[6] },
      ],
      PROPOSAL_MARGIN,
    );

    for (const row of input.content.feeLineItems) {
      const phase = String(row.phase || '').trim() || '—';
      const description = String(row.description || '').trim() || '—';
      const aH = row.dataAnalystHours != null ? Number(row.dataAnalystHours) : null;
      const aR = row.dataAnalystRate != null ? Number(row.dataAnalystRate) : null;
      const sH = row.specialistHours != null ? Number(row.specialistHours) : null;
      const sR = row.specialistRate != null ? Number(row.specialistRate) : null;
      // Legacy fallback when dual fields were never migrated into the snapshot yet.
      const legacyH = row.hours != null ? Number(row.hours) : null;
      const legacyR = row.rate != null ? Number(row.rate) : null;
      const showLegacy = aH == null && aR == null && sH == null && sR == null;
      drawTableRow(
        doc,
        chrome,
        [
          phase,
          description,
          showLegacy
            ? legacyH != null && Number.isFinite(legacyH)
              ? String(legacyH)
              : '—'
            : aH != null && Number.isFinite(aH)
              ? String(aH)
              : '—',
          showLegacy
            ? legacyR != null && Number.isFinite(legacyR)
              ? formatProposalMoney(legacyR, input.currency)
              : '—'
            : aR != null && Number.isFinite(aR)
              ? formatProposalMoney(aR, input.currency)
              : '—',
          showLegacy ? '—' : sH != null && Number.isFinite(sH) ? String(sH) : '—',
          showLegacy
            ? '—'
            : sR != null && Number.isFinite(sR)
              ? formatProposalMoney(sR, input.currency)
              : '—',
          formatProposalMoney(row.fee, input.currency),
        ],
        feeCols,
        PROPOSAL_MARGIN,
        { boldFirst: true },
      );
    }

    const discount = Number(input.discount) || 0;
    const expenseLines = Array.isArray(input.content.expenseLineItems)
      ? input.content.expenseLineItems
      : [];
    const includeExpenses =
      input.content.includeExpenses != null
        ? Boolean(input.content.includeExpenses)
        : expenseLines.length > 0 || Number(input.expensesEstimate) > 0;
    const expenses = includeExpenses ? Number(input.expensesEstimate) || 0 : 0;
    const vatPct = input.vatRate > 1 ? Math.round(input.vatRate) : Math.round(input.vatRate * 100);
    const totalsLabelCols = [CONTENT_W - 130, 130];

    const drawTotalsRow = (
      label: string,
      amount: string,
      opts?: { boldFirst?: boolean; fill?: string },
    ) => {
      drawTableRow(doc, chrome, [label, amount], totalsLabelCols, PROPOSAL_MARGIN, opts);
    };

    doc.moveDown(0.35);
    if (discount > 0) {
      drawTotalsRow('Professional fees (subtotal)', formatProposalMoney(input.feeTotals.subtotal, input.currency), {
        boldFirst: true,
      });
      drawTotalsRow('Discount', `-${formatProposalMoney(discount, input.currency)}`);
    }
    drawTotalsRow(
      'Professional fees (Ex. VAT)',
      formatProposalMoney(input.feeTotals.discountedSubtotal, input.currency),
      { boldFirst: true, fill: '#F4F6F8' },
    );
    drawTotalsRow(`VAT (${vatPct}%)`, formatProposalMoney(input.feeTotals.vatAmount, input.currency));

    if (includeExpenses && expenseLines.length > 0) {
      doc.moveDown(0.55);
      ensureProposalSpace(doc, chrome, 48);
      sectionTitle(doc, 'Estimated expenses', chrome.red, CONTENT_W);
      const expCols = [CONTENT_W - 70 - 50 - 90 - 90, 70, 50, 90, 90];
      drawTableHeader(
        doc,
        [
          { label: 'Expense', width: expCols[0] },
          { label: 'Unit', width: expCols[1] },
          { label: 'Qty', width: expCols[2] },
          { label: 'Unit rate', width: expCols[3] },
          { label: 'Total', width: expCols[4] },
        ],
        PROPOSAL_MARGIN,
      );
      for (const row of expenseLines) {
        drawTableRow(
          doc,
          chrome,
          [
            String(row.description || '').trim() || '—',
            String(row.unit || '').trim() || '—',
            row.quantity != null ? String(row.quantity) : '—',
            row.unitCharge != null
              ? formatProposalMoney(Number(row.unitCharge), input.currency)
              : '—',
            formatProposalMoney(Number(row.total) || 0, input.currency),
          ],
          expCols,
          PROPOSAL_MARGIN,
        );
      }
      drawTotalsRow('Estimated expenses', formatProposalMoney(expenses, input.currency), {
        boldFirst: true,
      });
    } else if (includeExpenses && expenses > 0) {
      drawTotalsRow('Estimated expenses', formatProposalMoney(expenses, input.currency));
    }

    drawTotalsRow(
      'Grand total (Incl. VAT)',
      formatProposalMoney(input.feeTotals.grandTotal, input.currency),
      { boldFirst: true, fill: '#E8F0FE' },
    );

    const paymentTerms = String(input.paymentTerms || '').trim();
    if (paymentTerms) {
      doc.moveDown(0.55);
      ensureProposalSpace(doc, chrome, 36);
      sectionTitle(doc, 'Payment terms', chrome.red, CONTENT_W);
      bodyText(doc, chrome, paymentTerms, CONTENT_W);
    }

    // Assumptions + responsibility
    beginMajorSection(doc, chrome, heading('assumptions'), CONTENT_W);
    mark(heading('assumptions'));
    const feeAssumptionLines = (input.content.feeAssumptions || [])
      .map((line) => String(line || '').trim())
      .filter(Boolean);
    if (feeAssumptionLines.length) {
      bodyText(
        doc,
        chrome,
        feeAssumptionLines.map((line) => `• ${line}`).join('\n'),
        CONTENT_W,
      );
      if (String(input.assumptions || '').trim()) doc.moveDown(0.25);
    }
    if (String(input.assumptions || '').trim()) {
      bodyText(doc, chrome, input.assumptions, CONTENT_W);
    }
    doc.moveDown(0.3);
    sectionTitle(doc, 'Statement of responsibility', chrome.red, CONTENT_W);
    bodyText(doc, chrome, input.statementOfResponsibility, CONTENT_W);

    // Timeline — dedicated slide with Gantt from admin timeline rows (or phase weeks)
    beginMajorSection(doc, chrome, heading('timelines'), CONTENT_W, { pageBreak: true });
    mark(heading('timelines'), { indent: true });
    const rawTimeline = input.content.timelineRows.length
      ? input.content.timelineRows
      : input.content.phases
          .filter((p) => p.name?.trim() && p.name !== '—')
          .map((p) => ({
            name: p.name,
            startWeek: Number(p.startWeek) || p.sequence,
            endWeek: Number(p.endWeek) || p.sequence + 2,
            sequence: p.sequence,
            color: p.color,
          }));
    const timelineRows = normalizeTimelineRows(
      rawTimeline,
      input.estimatedProjectWeeks,
    ).map((row, idx) => ({
      ...row,
      color: (rawTimeline[idx] as { color?: string } | undefined)?.color,
    }));

    // Columns cover estimated project weeks and any later end week; bars use start/end.
    const maxEndWeek = resolveGanttMaxWeeks(timelineRows, input.estimatedProjectWeeks);
    const minWeeks = Math.max(1, Number(input.estimatedProjectWeeks) || 0, maxEndWeek);
    drawTimelineIntro(
      doc,
      chrome,
      minWeeks,
      CONTENT_W,
      input.timelineNarrative,
      input.timelineSummary,
    );
    if (timelineRows.length) {
      drawProposedTimelineTable(doc, chrome, timelineRows, maxEndWeek, CONTENT_W);
    }

    // Team structure
    beginMajorSection(doc, chrome, heading('teamStructure'), CONTENT_W, { pageBreak: true });
    mark(heading('teamStructure'), { indent: true });
    drawTeamStructure(doc, chrome, {
      clientCompany: input.clientCompany,
      leadConsultant: input.leadConsultant || input.preparedByName || '',
      projectSponsor: input.projectSponsor,
      projectChampion: input.projectChampion,
    }, CONTENT_W);

    // Team bios + client experience (PPT table layout)
    beginMajorSection(doc, chrome, heading('team'), CONTENT_W, { pageBreak: true });
    mark(heading('team'), { indent: true });
    drawProposedTeamSection(doc, chrome, {
      teamMembers: input.content.teamMembers,
      experienceItems: input.content.experienceItems,
    }, CONTENT_W);

    // Appendix A
    beginMajorSection(doc, chrome, heading('appendixA'), CONTENT_W, { pageBreak: true });
    mark(heading('appendixA'));
    const appendixA = String(input.termsAndConditions || '').trim();
    if (appendixA) {
      // Keep full legal wording — do not collapse repeated clauses.
      bodyText(doc, chrome, appendixA, CONTENT_W, { skipDedupe: true });
    } else {
      bodyText(
        doc,
        chrome,
        `All services provided by Physical Risk to ${input.clientCompany} shall be in accordance with a written agreement, which shall be provided should Physical Risk Consultancy be awarded the requested service.`,
        CONTENT_W,
      );
    }

    // Appendix B
    beginMajorSection(doc, chrome, heading('appendixB'), CONTENT_W, { pageBreak: true });
    mark(heading('appendixB'));
    drawAcceptanceBlock(doc, chrome, {
      clientCompany: input.clientCompany,
      preparedByName: input.preparedByName || input.leadConsultant,
      preparedByEmail: input.preparedByEmail,
      acceptanceTerms: input.acceptanceTerms,
      accept: input.content.acceptance,
    }, CONTENT_W);

    // Remove trailing blank/header-only pages before back-filling contents.
    trimToTrackedContentPages(doc);

    // Back-fill contents page (page index 1).
    doc.switchToPage(CONTENTS_PAGE_INDEX);
    paintContentsPageBackground(doc);
    doc.x = PROPOSAL_MARGIN;
    doc.y = PROPOSAL_MARGIN;
    drawContentsPage(doc, chrome, toc, CONTENT_W);
    markProposalBodyContent(doc);
    clearPdfTextState(doc);

    // Footers on all pages except cover (1-based page numbers in footer).
    const range = doc.bufferedPageRange();
    const bodyPageCount = range.count - 1;
    for (let i = 1; i < range.count; i += 1) {
      clearPdfTextState(doc);
      doc.switchToPage(range.start + i);
      drawProposalFooter(doc, chrome, i, bodyPageCount, input.proposalNumber);
    }

    doc.end();
  });
}

export function proposalPdfV2Enabled(): boolean {
  const flag = process.env.PROPOSAL_PDF_V2;
  return flag === 'true' || flag === '1' || flag === undefined;
}
