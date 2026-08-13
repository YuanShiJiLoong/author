import assert from 'node:assert/strict';
import test from 'node:test';

import {
    migrateApiConfigToCompatible,
    resolveAiEndpoint,
} from '../app/lib/ai-provider-compat.js';

test('DeepSeek preset overrides a stale Claude providerType', () => {
    assert.equal(resolveAiEndpoint({
        provider: 'deepseek',
        providerType: 'claude',
        apiFormat: 'anthropic',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-pro',
    }), '/api/ai');
});

test('DeepSeek instance key also overrides stale protocol metadata', () => {
    assert.equal(resolveAiEndpoint({
        provider: 'deepseek_k3x9',
        providerType: 'claude',
        apiFormat: 'anthropic',
    }), '/api/ai');
});

test('real Claude and explicit Anthropic-compatible configurations keep the Claude route', () => {
    assert.equal(resolveAiEndpoint({ provider: 'claude', providerType: 'claude' }), '/api/ai/claude');
    assert.equal(resolveAiEndpoint({ provider: 'custom', apiFormat: 'anthropic' }), '/api/ai/claude');
});

test('Gemini native configuration keeps its dedicated route', () => {
    assert.equal(resolveAiEndpoint({ provider: 'gemini-native' }), '/api/ai/gemini');
});

test('migration repairs stale DeepSeek protocol metadata at both levels', () => {
    const config = {
        provider: 'deepseek',
        providerType: 'claude',
        apiFormat: 'anthropic',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-pro',
        providerConfigs: {
            deepseek: {
                providerType: 'claude',
                apiFormat: 'anthropic',
                baseUrl: 'https://api.deepseek.com',
                model: 'deepseek-v4-pro',
                models: ['deepseek-v4-pro'],
            },
        },
    };

    assert.equal(migrateApiConfigToCompatible(config), true);
    assert.equal(config.providerType, 'deepseek');
    assert.equal('apiFormat' in config, false);
    assert.equal(config.providerConfigs.deepseek.providerType, 'deepseek');
    assert.equal('apiFormat' in config.providerConfigs.deepseek, false);
    assert.equal(resolveAiEndpoint(config), '/api/ai');
});
