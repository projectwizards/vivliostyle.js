/**
 * Copyright 2017 Daishinsha Inc.
 * Copyright 2019 Vivliostyle Foundation
 *
 * Vivliostyle.js is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Vivliostyle.js is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Vivliostyle.js.  If not, see <http://www.gnu.org/licenses/>.
 *
 * @fileoverview Footnotes
 */
import * as Asserts from "./asserts";
import * as Base from "./base";
import * as Css from "./css";
import * as PageFloats from "./page-floats";
import * as SemanticFootnote from "./semantic-footnote";
import * as Task from "./task";
import * as Vtree from "./vtree";
import { Layout } from "./types";

const PageFloatFragment = PageFloats.PageFloatFragment;

export class Footnote extends PageFloats.PageFloat {
  constructor(
    nodePosition: Vtree.NodePosition,
    floatReference: PageFloats.FloatReference,
    flowName: string,
    public readonly footnotePolicy: Css.Ident | null,
    floatMinWrapBlock: Css.Numeric | null,
    public readonly policyAnchorNode: Node,
  ) {
    super(
      nodePosition,
      floatReference,
      "block-end",
      null,
      flowName,
      floatMinWrapBlock,
    );
  }

  override isAllowedToPrecede(other: PageFloats.PageFloat): boolean {
    return !(other instanceof Footnote);
  }
}

function getLinePolicyConstraintNode(anchorNode: Node): Node {
  let element =
    anchorNode.nodeType === Node.ELEMENT_NODE
      ? (anchorNode as Element)
      : anchorNode.parentElement;
  while (element) {
    if (
      /^(p|li|dd|dt|td|th|blockquote)$/i.test(element.localName) &&
      !element.querySelector("br")
    ) {
      return element;
    }
    element = element.parentElement;
  }
  return anchorNode;
}

/**
 * @extends PageFloatFragment
 */
export class FootnoteFragment extends PageFloatFragment {
  constructor(
    floatReference: PageFloats.FloatReference,
    continuations: PageFloats.PageFloatContinuation[],
    area: Vtree.Container,
    continues: boolean,
  ) {
    super(floatReference, "block-end", null, continuations, area, continues);
  }

  override getOrder(): number {
    return Infinity;
  }

  override shouldBeStashedBefore(float: PageFloats.PageFloat): boolean {
    if (float instanceof Footnote) {
      return true;
    } else {
      return this.getOrder() < float.getOrder();
    }
  }
}

export class LineFootnotePolicyLayoutConstraint
  implements Layout.LayoutConstraint
{
  constructor(public readonly footnote: Footnote) {}

  allowLayout(nodeContext: Vtree.NodeContext): boolean {
    let sourceNode: Node | null = nodeContext.shadowContext
      ? nodeContext.shadowContext.owner
      : nodeContext.sourceNode;
    while (sourceNode) {
      if (sourceNode === this.footnote.policyAnchorNode) {
        return false;
      }
      sourceNode = sourceNode.parentNode;
    }
    return true;
  }
}

export class FootnoteLayoutStrategy
  implements PageFloats.PageFloatLayoutStrategy
{
  /** @override */
  appliesToNodeContext(nodeContext: Vtree.NodeContext): boolean {
    return nodeContext.floatSide === "footnote";
  }

  /** @override */
  appliesToFloat(float: PageFloats.PageFloat): boolean {
    return float instanceof Footnote;
  }

  /** @override */
  createPageFloat(
    nodeContext: Vtree.NodeContext,
    pageFloatLayoutContext: PageFloats.PageFloatLayoutContext,
    column: Layout.Column,
  ): Task.Result<PageFloats.PageFloat> {
    let floatReference = PageFloats.FloatReference.REGION;

    // If the region context has the same container as the page context,
    // use the page context as the context for the footnote.
    const regionContext =
      pageFloatLayoutContext.getPageFloatLayoutContext(floatReference);
    const pageContext = pageFloatLayoutContext.getPageFloatLayoutContext(
      PageFloats.FloatReference.PAGE,
    );
    if (pageContext.hasSameContainerAs(regionContext)) {
      floatReference = PageFloats.FloatReference.PAGE;
    }

    // When inside a page float area, use PAGE level so the footnote fragment
    // survives page-level layout retries triggered by the outer page float.
    // (Issue #1675)
    const insidePageFloat = !!pageFloatLayoutContext.generatingNodePosition;
    if (insidePageFloat && floatReference !== PageFloats.FloatReference.PAGE) {
      floatReference = PageFloats.FloatReference.PAGE;
    }

    const nodePosition = nodeContext.toNodePosition();
    Asserts.assert(pageFloatLayoutContext.flowName);
    let policyAnchorNode: Node = nodeContext.sourceNode;
    const shadowOwner = nodeContext.shadowContext?.owner;
    if (
      shadowOwner instanceof Element &&
      SemanticFootnote.isSemanticFootnoteNoterefElement(shadowOwner)
    ) {
      policyAnchorNode = shadowOwner;
    }
    policyAnchorNode = getLinePolicyConstraintNode(policyAnchorNode);
    const float: PageFloats.PageFloat = new Footnote(
      nodePosition,
      floatReference,
      pageFloatLayoutContext.flowName,
      nodeContext.footnotePolicy,
      nodeContext.floatMinWrapBlock,
      policyAnchorNode,
    );
    float.insidePageFloatArea = insidePageFloat;
    if (insidePageFloat) {
      const parentNodePos = pageFloatLayoutContext.generatingNodePosition;
      if (parentNodePos) {
        float.parentPageFloat =
          pageFloatLayoutContext.findPageFloatByNodePosition(parentNodePos);
      }
    }
    pageFloatLayoutContext.addPageFloat(float);
    return Task.newResult(float);
  }

  /** @override */
  createPageFloatFragment(
    continuations: PageFloats.PageFloatContinuation[],
    floatSide: string,
    clearSide: string | null,
    floatArea: Layout.PageFloatArea,
    continues: boolean,
  ): PageFloats.PageFloatFragment {
    const f = continuations[0].float;
    return new FootnoteFragment(
      f.floatReference,
      continuations,
      floatArea,
      continues,
    );
  }

  /** @override */
  findPageFloatFragment(
    float: PageFloats.PageFloat,
    pageFloatLayoutContext: PageFloats.PageFloatLayoutContext,
  ): PageFloats.PageFloatFragment | null {
    const context = pageFloatLayoutContext.getPageFloatLayoutContext(
      float.floatReference,
    );
    const fragments = context.floatFragments.filter(
      (fr) => fr instanceof FootnoteFragment,
    );
    Asserts.assert(fragments.length <= 1);
    return fragments[0] || null;
  }

  /** @override */
  adjustPageFloatArea(
    floatArea: Layout.PageFloatArea,
    floatContainer: Vtree.Container,
    column: Layout.Column,
  ): Task.Result<void> {
    floatArea.isFootnote = true;
    floatArea.adjustContentRelativeSize = false;
    const element = floatArea.element;
    Asserts.assert(element);
    return column.layoutContext
      .applyFootnoteStyle(
        floatContainer.vertical,
        (column.layoutContext as any).nodeContext &&
          (column.layoutContext as any).nodeContext.direction === "rtl",
        element,
      )
      .thenAsync((vertical) => {
        floatArea.vertical = vertical;
        floatArea.convertPercentageSizesToPx(element);
        column.setComputedInsets(element, floatArea);
        column.setComputedWidthAndHeight(element, floatArea);
        // Handle box-sizing: border-box for footnote areas (Issue #1878).
        // The layout engine always works in content-box mode. When the user
        // specifies box-sizing: border-box, convert max-height/min-height
        // to content-box equivalents and reset box-sizing on the element.
        const computedBoxSizing =
          column.clientLayout.getElementComputedStyle(element)?.boxSizing;
        if (computedBoxSizing === "border-box") {
          const blockInsets = floatArea.vertical
            ? floatArea.paddingLeft +
              floatArea.paddingRight +
              floatArea.borderLeft +
              floatArea.borderRight
            : floatArea.paddingTop +
              floatArea.paddingBottom +
              floatArea.borderTop +
              floatArea.borderBottom;
          // In vertical writing mode, block-direction properties are
          // width/max-width/min-width instead of height/max-height/min-height.
          const blockProps = floatArea.vertical
            ? ["max-width", "min-width", "width"]
            : ["max-height", "min-height", "height"];
          const cs = getComputedStyle(element);
          for (const prop of blockProps) {
            const val = cs.getPropertyValue(prop);
            if (val && val !== "none") {
              const px = parseFloat(val);
              if (!isNaN(px)) {
                Base.setCSSProperty(
                  element,
                  prop,
                  `${Math.max(0, px - blockInsets)}px`,
                );
              }
            }
          }
          Base.setCSSProperty(element, "box-sizing", "content-box");
        }
        // CSS GCPM §2.4.2: "The max-height property on the footnote area
        // limits the size of this area, unless the page contains only
        // footnotes." When the page-level context has
        // ignoreFootnoteAreaMaxHeight set (detected after a prior layout
        // pass found no body content), remove max-height. (Issue #1878)
        let pageCtx: PageFloats.PageFloatLayoutContext | null =
          column.pageFloatLayoutContext as PageFloats.PageFloatLayoutContext;
        while (pageCtx) {
          if (pageCtx.ignoreFootnoteAreaMaxHeight) {
            // Clear both logical and physical max-block-size properties
            Base.setCSSProperty(element, "max-block-size", "");
            Base.setCSSProperty(
              element,
              floatArea.vertical ? "max-width" : "max-height",
              "",
            );
            break;
          }
          pageCtx = pageCtx.parent ?? null;
        }
        return Task.newResult(undefined);
      });
  }

  /** @override */
  forbid(
    float: PageFloats.PageFloat,
    pageFloatLayoutContext: PageFloats.PageFloatLayoutContext,
  ) {
    const footnote = float as Footnote;
    switch (footnote.footnotePolicy) {
      case Css.ident.line: {
        const constraint = new LineFootnotePolicyLayoutConstraint(footnote);
        pageFloatLayoutContext.addLayoutConstraint(
          constraint,
          footnote.floatReference,
        );
        break;
      }
    }
  }
}

PageFloats.PageFloatLayoutStrategyResolver.register(
  new FootnoteLayoutStrategy(),
);
