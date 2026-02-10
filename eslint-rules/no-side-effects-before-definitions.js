/**
 * ESLint rule: no-side-effects-before-definitions
 *
 * Prevents top-level side-effectful statements (function calls, try blocks,
 * assignments) from appearing before the last module-level const/let
 * declaration. This catches a class of Temporal Dead Zone (TDZ) bugs that
 * `no-use-before-define` cannot detect:
 *
 *   initializeState();              // line 10 — calls hoisted fn
 *   const MAX = 86400;              // line 50 — TDZ at runtime!
 *   function initializeState() {    // line 60 — hoisted, references MAX
 *     doWork(MAX);
 *   }
 *
 * The rule doesn't need call-graph analysis. The structural invariant is:
 * if ALL const/let declarations precede ALL side effects in source order,
 * no hoisted function can ever read an uninitialized binding.
 *
 * Declarations (safe, never flagged):
 *   ImportDeclaration, ExportNamedDeclaration, ExportDefaultDeclaration,
 *   FunctionDeclaration, ClassDeclaration, VariableDeclaration,
 *   TSTypeAliasDeclaration, TSInterfaceDeclaration, TSEnumDeclaration,
 *   ExportAllDeclaration
 *
 * Everything else is treated as a side effect.
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow top-level side effects before the last const/let declaration ' +
        'to prevent Temporal Dead Zone errors from hoisted function calls.',
    },
    messages: {
      sideEffectBeforeDefinition:
        'Top-level side effect appears before a const/let declaration at line {{defLine}}. ' +
        'Move all const/let declarations above this statement to prevent TDZ errors.',
    },
    schema: [],
  },

  create(context) {
    return {
      Program(node) {
        const body = node.body;

        // Collect positions of const/let declarations and side-effect statements.
        const constLetDeclarations = [];
        const sideEffects = [];

        for (const stmt of body) {
          if (isDeclaration(stmt)) {
            // Track const/let variable declarations (not var — var is hoisted).
            if (
              stmt.type === 'VariableDeclaration' &&
              (stmt.kind === 'const' || stmt.kind === 'let')
            ) {
              constLetDeclarations.push(stmt);
            }
            // Also check for const/let inside export: `export const X = ...`
            if (
              stmt.type === 'ExportNamedDeclaration' &&
              stmt.declaration &&
              stmt.declaration.type === 'VariableDeclaration' &&
              (stmt.declaration.kind === 'const' ||
                stmt.declaration.kind === 'let')
            ) {
              constLetDeclarations.push(stmt);
            }
          } else {
            sideEffects.push(stmt);
          }
        }

        if (constLetDeclarations.length === 0 || sideEffects.length === 0) {
          return; // Nothing to check.
        }

        // Find the last const/let declaration in source order.
        const lastConstLet =
          constLetDeclarations[constLetDeclarations.length - 1];
        const lastConstLetLine = lastConstLet.loc.start.line;

        // Flag any side effect that appears before the last const/let.
        for (const effect of sideEffects) {
          if (effect.loc.start.line < lastConstLetLine) {
            context.report({
              node: effect,
              messageId: 'sideEffectBeforeDefinition',
              data: { defLine: String(lastConstLetLine) },
            });
          }
        }
      },
    };
  },
};

/**
 * Returns true if the AST node is a "pure declaration" that has no
 * runtime side effects at the point of evaluation.
 */
function isDeclaration(node) {
  switch (node.type) {
    // Imports / exports
    case 'ImportDeclaration':
    case 'ExportAllDeclaration':
      return true;

    case 'ExportNamedDeclaration':
    case 'ExportDefaultDeclaration':
      // `export function foo()` or `export const x = 1` — the inner
      // declaration is what matters. If there's no declaration (re-export),
      // it's still side-effect-free.
      if (!node.declaration) return true;
      return isDeclaration(node.declaration);

    // Declarations
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
    case 'VariableDeclaration':
    case 'TSTypeAliasDeclaration':
    case 'TSInterfaceDeclaration':
    case 'TSEnumDeclaration':
    case 'TSDeclareFunction':
    case 'TSModuleDeclaration':
      return true;

    default:
      return false;
  }
}

export default rule;
