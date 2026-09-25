/**
 * ts-jest AST transformer. Jest runs this suite as CommonJS, where
 * `import.meta` is a syntax error, so a test could not import src/server.ts.
 * This rewrites `import.meta.url` to the file URL of the compiled module
 * (`require('node:url').pathToFileURL(__filename).href`) and changes nothing
 * else. Production builds use tsc and are not affected.
 */

exports.name = 'import-meta-url';
// Bump when the transform changes, so jest does not reuse cached output
exports.version = 1;

exports.factory = ({ configSet }) => {
  const ts = configSet.compilerModule;
  const f = ts.factory;

  const isImportMetaUrl = node =>
    ts.isPropertyAccessExpression(node) &&
    ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    node.name.text === 'url';

  const fileUrl = () =>
    f.createPropertyAccessExpression(
      f.createCallExpression(
        f.createPropertyAccessExpression(
          f.createCallExpression(f.createIdentifier('require'), undefined, [
            f.createStringLiteral('node:url'),
          ]),
          'pathToFileURL'
        ),
        undefined,
        [f.createIdentifier('__filename')]
      ),
      'href'
    );

  return context => sourceFile => {
    const visit = node =>
      isImportMetaUrl(node)
        ? fileUrl()
        : ts.visitEachChild(node, visit, context);
    return ts.visitNode(sourceFile, visit);
  };
};
