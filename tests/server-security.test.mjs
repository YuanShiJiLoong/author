import assert from 'node:assert/strict';
import test from 'node:test';

import {
    assertSafeOutboundUrl,
    authorizeSourceUpdate,
    isAuthorizedDesktopRequest,
    isPublicIpAddress,
    resolveAiCredential,
} from '../app/lib/server-security.mjs';

function requestWithCookie(value = '') {
    return {
        headers: new Headers(value ? { cookie: `author-desktop-capability=${encodeURIComponent(value)}` } : {}),
    };
}

test('private and loopback IP addresses are rejected by default', async () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '192.168.1.10', '169.254.169.254', '::1']) {
        assert.equal(isPublicIpAddress(address), false, address);
    }
    await assert.rejects(
        assertSafeOutboundUrl('http://127.0.0.1:8080/api'),
        error => error?.code === 'OUTBOUND_REQUEST_BLOCKED',
    );
});

test('private addresses require an explicit trusted-channel policy', async () => {
    const parsed = await assertSafeOutboundUrl('http://127.0.0.1:8080/api', {
        allowPrivateNetwork: true,
    });
    assert.equal(parsed.hostname, '127.0.0.1');
});

test('desktop capability cookie must match the per-launch secret', () => {
    const previous = process.env.AUTHOR_DESKTOP_CAPABILITY;
    process.env.AUTHOR_DESKTOP_CAPABILITY = 'test-capability-value-1234567890';
    try {
        assert.equal(isAuthorizedDesktopRequest(requestWithCookie()), false);
        assert.equal(isAuthorizedDesktopRequest(requestWithCookie('wrong')), false);
        assert.equal(
            isAuthorizedDesktopRequest(requestWithCookie('test-capability-value-1234567890')),
            true,
        );
    } finally {
        if (previous === undefined) delete process.env.AUTHOR_DESKTOP_CAPABILITY;
        else process.env.AUTHOR_DESKTOP_CAPABILITY = previous;
    }
});

test('source update is disabled without a server token and rejects invalid tokens', () => {
    const previous = process.env.AUTHOR_UPDATE_TOKEN;
    try {
        delete process.env.AUTHOR_UPDATE_TOKEN;
        assert.deepEqual(authorizeSourceUpdate({ headers: new Headers() }), {
            ok: false,
            status: 403,
            code: 'SOURCE_UPDATE_DISABLED',
        });

        const configuredToken = 'x'.repeat(40);
        process.env.AUTHOR_UPDATE_TOKEN = configuredToken;
        assert.equal(authorizeSourceUpdate({ headers: new Headers() }).status, 401);
        assert.equal(
            authorizeSourceUpdate({ headers: new Headers({ 'x-author-update-token': 'wrong' }) }).status,
            403,
        );
        assert.deepEqual(
            authorizeSourceUpdate({
                headers: new Headers({ authorization: `Bearer ${configuredToken}` }),
            }),
            { ok: true },
        );
    } finally {
        if (previous === undefined) delete process.env.AUTHOR_UPDATE_TOKEN;
        else process.env.AUTHOR_UPDATE_TOKEN = previous;
    }
});

test('client-owned keys may use their client-selected endpoint', () => {
    const result = resolveAiCredential({
        request: requestWithCookie(),
        clientApiKey: 'client-key',
        clientBaseUrl: 'https://client.example/v1/',
        envApiKey: 'server-key',
        envBaseUrl: 'https://server.example/v1',
    });
    assert.deepEqual(result, {
        apiKey: 'client-key',
        baseUrl: 'https://client.example/v1',
    });
});

test('server-owned keys require desktop authorization and a fixed endpoint', () => {
    const previous = process.env.AUTHOR_DESKTOP_CAPABILITY;
    const capability = 'test-capability-value-1234567890';
    process.env.AUTHOR_DESKTOP_CAPABILITY = capability;
    try {
        const base = {
            clientApiKey: '',
            envApiKey: 'server-key',
            envBaseUrl: 'https://server.example/v1',
        };
        assert.throws(
            () => resolveAiCredential({
                ...base,
                request: requestWithCookie(),
                clientBaseUrl: 'https://server.example/v1',
            }),
            error => error?.code === 'SERVER_CREDENTIAL_BLOCKED',
        );
        assert.throws(
            () => resolveAiCredential({
                ...base,
                request: requestWithCookie(capability),
                clientBaseUrl: 'https://attacker.example/v1',
            }),
            error => error?.code === 'SERVER_CREDENTIAL_BLOCKED',
        );
        assert.deepEqual(resolveAiCredential({
            ...base,
            request: requestWithCookie(capability),
            clientBaseUrl: 'https://server.example/v1/',
        }), {
            apiKey: 'server-key',
            baseUrl: 'https://server.example/v1',
        });
    } finally {
        if (previous === undefined) delete process.env.AUTHOR_DESKTOP_CAPABILITY;
        else process.env.AUTHOR_DESKTOP_CAPABILITY = previous;
    }
});

test('代理 fake-ip 假地址（198.18.0.0/15）单独识别，仍不算公网', async () => {
    const { isFakeIpAddress, isPublicIpAddress, isOutboundRequestBlocked, FAKE_IP_BLOCKED_CODE } = await import('../app/lib/server-security.mjs');
    for (const address of ['198.18.1.18', '198.19.255.1', '::ffff:198.18.0.5']) {
        assert.equal(isFakeIpAddress(address), true, address);
        assert.equal(isPublicIpAddress(address), false, address);
    }
    for (const address of ['198.20.0.1', '8.8.8.8', '192.168.1.1', '']) {
        assert.equal(isFakeIpAddress(address), false, address);
    }
    assert.equal(isOutboundRequestBlocked({ code: FAKE_IP_BLOCKED_CODE }), true);
});
