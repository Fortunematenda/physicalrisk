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
import type { PhysicalRiskProposalInput } from './proposal-template-types';

const CONTENT_W = PROPOSAL_PAGE_WIDTH - PROPOSAL_MARGIN * 2;
const CONTENTS_PAGE_INDEX = 1;

type TocEntry = { title: string; page: number; indent?: boolean };

function phaseBulletLinesFromText(value: string): string[] {
  return String(value || '')
    .split(/\r?\n+/)
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
      clientCompany: input.clientCompany,
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

    // Understanding your needs
    beginMajorSection(doc, chrome, 'Understanding your needs', CONTENT_W);
    mark('Understanding your needs');
    bodyText(doc, chrome, input.understandingOfNeeds, CONTENT_W);

    // Scope and objectives — PPTX two-column slide with Security Review diagram
    beginScopeObjectivesSlide(doc, chrome);
    mark('Scope and objectives');
    drawScopeAndObjectivesSlide(
      doc,
      chrome,
      {
        scopeObjectives: input.objectives,
        scopeBody: input.scope,
        approach: input.approach,
      },
      CONTENT_W,
    );

    // Methodology
    beginMajorSection(doc, chrome, 'Methodology', CONTENT_W, { pageBreak: true });
    mark('Methodology');
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
    beginMajorSection(doc, chrome, 'Approach', CONTENT_W, { pageBreak: true });
    mark('Approach');
    const exclusionItems = input.content.projectExclusions.length
      ? input.content.projectExclusions
      : phaseBulletLinesFromText(input.exclusions);
    drawPhaseMatrix(doc, chrome, padPhases(input), CONTENT_W, {
      exclusions: exclusionItems,
    });

    // Detailed approach
    beginMajorSection(doc, chrome, 'Our detailed approach', CONTENT_W);
    mark('Our detailed approach');
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
      beginMajorSection(doc, chrome, 'Deliverables', CONTENT_W);
      mark('Deliverables');
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

    // Fees
    beginMajorSection(doc, chrome, 'Proposed fees', CONTENT_W, { pageBreak: true });
    mark('Proposed fees');
    doc.fillColor('#333').font('Helvetica').fontSize(9)
      .text(
        `Analyst rate: ${formatProposalMoney(input.analystHourlyRate, input.currency)} per hour. Specialist rate: ${formatProposalMoney(input.specialistHourlyRate, input.currency)} per hour.`,
        { width: CONTENT_W },
      );
    markProposalBodyContent(doc);
    doc.moveDown(0.4);
    const feeCols = [CONTENT_W - 180, 60, 120];
    drawTableHeader(
      doc,
      [{ label: 'Phase / Description', width: feeCols[0] }, { label: 'Hours', width: feeCols[1] }, { label: 'Fee', width: feeCols[2] }],
      PROPOSAL_MARGIN,
    );
    for (const row of input.content.feeLineItems) {
      drawTableRow(
        doc,
        chrome,
        [row.description, row.hours != null ? String(row.hours) : '—', formatProposalMoney(row.fee, input.currency)],
        feeCols,
        PROPOSAL_MARGIN,
        { boldFirst: true },
      );
    }
    drawTableRow(doc, chrome, ['Subtotal', '', formatProposalMoney(input.feeTotals.subtotal, input.currency)], feeCols, PROPOSAL_MARGIN, { boldFirst: true });
    if (input.discount > 0) {
      drawTableRow(doc, chrome, ['Discount', '', `-${formatProposalMoney(input.discount, input.currency)}`], feeCols, PROPOSAL_MARGIN);
    }
    drawTableRow(doc, chrome, [`VAT (${Math.round(input.vatRate * 100)}%)`, '', formatProposalMoney(input.feeTotals.vatAmount, input.currency)], feeCols, PROPOSAL_MARGIN);
    if (input.expensesEstimate > 0) {
      drawTableRow(doc, chrome, ['Expenses (estimated)', '', formatProposalMoney(input.expensesEstimate, input.currency)], feeCols, PROPOSAL_MARGIN);
    }
    drawTableRow(
      doc,
      chrome,
      ['Total', '', formatProposalMoney(input.feeTotals.grandTotal, input.currency)],
      feeCols,
      PROPOSAL_MARGIN,
      { boldFirst: true, fill: '#E8F0FE' },
    );

    // Assumptions + responsibility
    beginMajorSection(doc, chrome, 'Fees and project assumptions', CONTENT_W);
    mark('Fees and project assumptions');
    bodyText(doc, chrome, input.assumptions, CONTENT_W);
    doc.moveDown(0.3);
    sectionTitle(doc, 'Statement of responsibility', chrome.red, CONTENT_W);
    bodyText(doc, chrome, input.statementOfResponsibility, CONTENT_W);

    // Timeline — dedicated slide with template Gantt table
    beginMajorSection(doc, chrome, 'Proposed timelines', CONTENT_W, { pageBreak: true });
    mark('Proposed timelines', { indent: true });
    const timelineRows = input.content.timelineRows.length
      ? input.content.timelineRows
      : input.content.phases
          .filter((p) => p.name?.trim() && p.name !== '—')
          .map((p) => ({
            name: p.name,
            startWeek: p.startWeek || p.sequence,
            endWeek: p.endWeek || p.sequence + 2,
            sequence: p.sequence,
            color: p.color,
          }));
    const maxFromRows = timelineRows.length
      ? Math.max(...timelineRows.map((r) => Number(r.endWeek) || 0))
      : 0;
    const maxEndWeek = Math.max(
      1,
      Number(input.estimatedProjectWeeks) || 0,
      maxFromRows,
    );
    const minWeeks = Number(input.estimatedProjectWeeks) || maxEndWeek;
    drawTimelineIntro(doc, chrome, minWeeks, CONTENT_W, input.timelineNarrative);
    if (timelineRows.length) {
      drawProposedTimelineTable(doc, chrome, timelineRows, maxEndWeek, CONTENT_W);
    }

    // Team structure
    beginMajorSection(doc, chrome, 'Proposed team structure', CONTENT_W, { pageBreak: true });
    mark('Proposed team structure', { indent: true });
    drawTeamStructure(doc, chrome, {
      clientCompany: input.clientCompany,
      leadConsultant: input.leadConsultant || input.preparedByName || '',
      projectSponsor: input.projectSponsor,
      projectChampion: input.projectChampion,
    }, CONTENT_W);

    // Team bios + client experience (PPT table layout)
    beginMajorSection(doc, chrome, 'Proposed team', CONTENT_W, { pageBreak: true });
    mark('Proposed team', { indent: true });
    drawProposedTeamSection(doc, chrome, {
      teamMembers: input.content.teamMembers,
      experienceItems: input.content.experienceItems,
    }, CONTENT_W);

    // Appendix A
    beginMajorSection(doc, chrome, 'Appendix A - Terms & conditions of service', CONTENT_W, { pageBreak: true });
    mark('Appendix A – Terms and conditions of service');
    bodyText(doc, chrome, input.termsAndConditions, CONTENT_W);

    // Appendix B
    beginMajorSection(doc, chrome, 'Appendix B - Acceptance of proposal', CONTENT_W, { pageBreak: true });
    mark('Appendix B – Acceptance of proposal');
    drawAcceptanceBlock(doc, chrome, {
      clientCompany: input.clientCompany,
      preparedByName: input.preparedByName || input.leadConsultant,
      preparedByEmail: input.preparedByEmail,
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
