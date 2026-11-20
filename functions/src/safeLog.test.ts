import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { safeErr } from './safeLog';
import { scrubAxiosError } from './axiosErrorScrub';

const MARKER = 'Bearer SECRET-MARKER-TOKEN';

function axiosFailure(): AxiosError {
  const config = {
    url: 'https://api.example.com/files/1?filter=SECRET-MARKER-EMAIL',
    method: 'patch',
    headers: new AxiosHeaders({ Authorization: MARKER }),
    data: '{"students":[{"pin":"SECRET-MARKER-PIN"}]}',
    params: { filter: 'SECRET-MARKER-EMAIL' },
  };
  return new AxiosError(
    'Request failed with status code 403',
    'ERR_BAD_REQUEST',
    config as never,
    { _header: `Authorization: ${MARKER}` },
    {
      status: 403,
      statusText: 'Forbidden',
      headers: {},
      data: { error: 'denied' },
      config: config as never,
    }
  );
}

describe('safeErr', () => {
  it('reduces an AxiosError to name, code and status', () => {
    const out = safeErr(axiosFailure());
    expect(out).toBe(
      'AxiosError ERR_BAD_REQUEST HTTP 403: Request failed with status code 403'
    );
  });

  it('keeps request data out of util.inspect output', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    console.error('failed', safeErr(axiosFailure()));
    expect(JSON.stringify(spy.mock.calls)).not.toContain('SECRET-MARKER');
    spy.mockRestore();
  });

  it('summarises an error whose cause carries request data', () => {
    const wrapped = new Error('wrapped', { cause: axiosFailure() });
    expect(typeof safeErr(wrapped)).toBe('string');
  });

  it('summarises token-validation errors that carry a payload', () => {
    const err = Object.assign(new Error('"exp" claim timestamp check failed'), {
      name: 'JWTExpired',
      code: 'ERR_JWT_EXPIRED',
      payload: { email: 'SECRET-MARKER-EMAIL' },
    });
    expect(safeErr(err)).toBe(
      'JWTExpired ERR_JWT_EXPIRED: "exp" claim timestamp check failed'
    );
  });

  it('passes ordinary errors and non-objects through unchanged', () => {
    const plain = new Error('boom');
    expect(safeErr(plain)).toBe(plain);
    expect(safeErr('text')).toBe('text');
    expect(safeErr(undefined)).toBeUndefined();
  });
});

describe('scrubAxiosError', () => {
  it('drops headers, params, body and raw request but keeps status and data', () => {
    const err = axiosFailure();
    scrubAxiosError(err);
    expect(axios.isAxiosError(err)).toBe(true);
    expect(err.response?.status).toBe(403);
    expect(err.response?.data).toEqual({ error: 'denied' });
    expect(err.config?.url).toBe('https://api.example.com/files/1');
    const dump = JSON.stringify([err.config, err.request, err.response]);
    expect(dump).not.toContain('SECRET-MARKER');
    expect(JSON.stringify(err.toJSON())).not.toContain('SECRET-MARKER');
  });
});

describe('log call sites', () => {
  const RESULT_NAME = /^(?:r|res|result|stamp|\w*Result)$/;

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        return name === 'devGradebookDemo' ? [] : sourceFiles(p);
      }
      return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
    });
  }

  function bareErrorSites(fileName: string, text: string): number[] {
    const sf = ts.createSourceFile(
      fileName,
      text,
      ts.ScriptTarget.Latest,
      true
    );
    const caught = new Set<string>();
    const collect = (node: ts.Node) => {
      if (
        ts.isCatchClause(node) &&
        node.variableDeclaration &&
        ts.isIdentifier(node.variableDeclaration.name)
      ) {
        caught.add(node.variableDeclaration.name.text);
      }
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'catch'
      ) {
        for (const arg of node.arguments) {
          if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
            for (const p of arg.parameters) {
              if (ts.isIdentifier(p.name)) caught.add(p.name.text);
            }
          }
        }
      }
      ts.forEachChild(node, collect);
    };
    collect(sf);

    const unwrap = (e: ts.Expression): ts.Expression => {
      let cur = e;
      while (
        ts.isParenthesizedExpression(cur) ||
        ts.isAsExpression(cur) ||
        ts.isNonNullExpression(cur)
      ) {
        cur = cur.expression;
      }
      return cur;
    };
    const isBare = (raw: ts.Expression): boolean => {
      const e = unwrap(raw);
      if (ts.isIdentifier(e)) return caught.has(e.text);
      if (ts.isPropertyAccessExpression(e)) {
        const obj = unwrap(e.expression);
        return (
          e.name.text === 'reason' &&
          ts.isIdentifier(obj) &&
          RESULT_NAME.test(obj.text)
        );
      }
      if (ts.isObjectLiteralExpression(e)) {
        return e.properties.some((p) => {
          if (ts.isShorthandPropertyAssignment(p))
            return caught.has(p.name.text);
          if (ts.isPropertyAssignment(p)) return isBare(p.initializer);
          return false;
        });
      }
      return false;
    };

    const lines: number[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        ['console', 'logger'].includes(node.expression.expression.text) &&
        node.arguments.some(isBare)
      ) {
        lines.push(sf.getLineAndCharacterOfPosition(node.getStart()).line + 1);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return lines;
  }

  it('never hands a caught error straight to the logger', () => {
    const offenders = sourceFiles(__dirname).flatMap((file) =>
      bareErrorSites(file, readFileSync(file, 'utf8')).map(
        (line) => `${relative(__dirname, file)}:${line}`
      )
    );
    expect(
      offenders,
      'wrap the error in safeErr() from ./safeLog (an AxiosError carries request headers, tokens and bodies)'
    ).toEqual([]);
  });

  it('catches the shapes the guard exists for', () => {
    const src = `
      try {} catch (err) {
        console.error('a', err as Error); // don't
        logger.warn('b', { ctx: { err } });
        logger.warn('c', { cause: err });
      }
      p.catch((releaseError) => console.error('d', releaseError));
      console.error('e', results[0].reason, res.reason);
    `;
    expect(bareErrorSites('x.ts', src)).toEqual([3, 4, 5, 7, 8]);
    const safe = `
      try {} catch (err) {
        console.error('a', safeErr(err), String(err), err instanceof Error ? err.message : '');
      }
      console.error('b', action.reason);
    `;
    expect(bareErrorSites('y.ts', safe)).toEqual([]);
  });
});
