import { afterEach, describe, expect, test } from 'bun:test';
import {
  checkRepositoryReleases,
  formatReleaseMessage,
  resetReleaseStoreForTests,
  type GitHubRelease,
} from '../../services/githubReleaseService';

describe('githubReleaseService', () => {
  afterEach(() => {
    resetReleaseStoreForTests();
  });

  test('retourne une nouvelle release puis null au second passage identique', async () => {
    const release: GitHubRelease = {
      id: 99,
      tag_name: 'v1.0.0',
      name: 'Version 1.0.0',
      body: 'Notes de version',
      published_at: '2026-04-04T10:00:00.000Z',
      html_url: 'https://github.com/org/repo/releases/tag/v1.0.0',
    };

    const fetchMock = async () => ({
      status: 200,
      ok: true,
      statusText: 'OK',
      json: async () => release,
    }) as Response;

    const first = await checkRepositoryReleases('guild-1', 'org', 'repo', fetchMock);
    const second = await checkRepositoryReleases('guild-1', 'org', 'repo', fetchMock);

    expect(first?.id).toBe(99);
    expect(second).toBeNull();
  });

  test('retourne null si 404', async () => {
    const fetchMock = async () => ({
      status: 404,
      ok: false,
      statusText: 'Not Found',
      json: async () => ({}),
    }) as Response;

    const result = await checkRepositoryReleases('guild-1', 'org', 'repo', fetchMock);
    expect(result).toBeNull();
  });

  test('formate le message release avec fallback description', () => {
    const message = formatReleaseMessage(
      {
        id: 1,
        tag_name: 'v1.2.3',
        name: '',
        body: null,
        published_at: '2026-04-04T10:00:00.000Z',
        html_url: 'https://github.com/org/repo/releases/tag/v1.2.3',
      },
      'org/repo',
    );

    expect(message).toContain('org/repo');
    expect(message).toContain('v1.2.3');
    expect(message).toContain('Pas de description');
  });
});
