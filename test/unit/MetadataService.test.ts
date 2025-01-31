// Copyright (c) Brock Allen & Dominick Baier. All rights reserved.
// Licensed under the Apache License, Version 2.0. See LICENSE in the project root for license information.

import { Log } from "../../src/utils";
import { MetadataService } from "../../src/MetadataService";
import { OidcClientSettings, OidcClientSettingsStore } from "../../src/OidcClientSettings";

describe("MetadataService", () => {
    let settings: OidcClientSettings;
    let subject: MetadataService;

    beforeEach(() => {
        Log.logger = console;
        Log.level = Log.NONE;

        settings = {
            authority: "authority",
            client_id: "client",
            redirect_uri: "redirect"
        };
        subject = new MetadataService(new OidcClientSettingsStore(settings));
    });

    describe("getMetadata", () => {
        it("should return a promise", async () => {
            // act
            const p = subject.getMetadata();

            // assert
            expect(p).toBeInstanceOf(Promise);
            // eslint-disable-next-line no-empty
            try { await p; } catch {}
        });

        it("should use metadata on settings", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadata: { issuer: "test" },
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));

            // act
            const result = await subject.getMetadata();

            // assert
            expect(result).toEqual({ issuer: "test" });
        });

        it("should calculate metadataUrl from authority", async () => {
            // arrange
            const jsonService = subject["_jsonService"]; // access private member
            const getJsonMock = jest.spyOn(jsonService, "getJson")
                .mockImplementation(() => Promise.resolve("test"));

            // act
            await subject.getMetadata();

            // assert
            expect(getJsonMock).toBeCalledWith("authority/.well-known/openid-configuration");
        });

        it("should use metadataUrl to make json call", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadataUrl: "http://sts/metadata"
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));
            const jsonService = subject["_jsonService"]; // access private member
            const getJsonMock = jest.spyOn(jsonService, "getJson")
                .mockImplementation(() => Promise.resolve("test"));

            // act
            await subject.getMetadata();

            // assert
            expect(getJsonMock).toBeCalledWith("http://sts/metadata");
        });

        it("should return metadata from json call", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadataUrl: "http://sts/metadata"
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));
            const jsonService = subject["_jsonService"]; // access private member
            const json = { "test": "data" };
            jest.spyOn(jsonService, "getJson").mockImplementation(() => Promise.resolve(json));

            // act
            const result = await subject.getMetadata();

            // assert
            expect(result).toEqual(json);
        });

        it("should cache metadata from json call", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadataUrl: "http://sts/metadata"
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));
            const jsonService = subject["_jsonService"]; // access private member
            const json = { test: "value" };
            jest.spyOn(jsonService, "getJson").mockImplementation(() => Promise.resolve(json));

            // act
            await subject.getMetadata();

            // assert
            const _metadata = subject["_metadata"]; // access private member
            expect(_metadata).toEqual(json);
        });

        it("should merge metadata from seed", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadataUrl: "http://sts/metadata",
                metadataSeed: { issuer: "one" }
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));
            const jsonService = subject["_jsonService"]; // access private member
            jest.spyOn(jsonService, "getJson").mockImplementation(() => Promise.resolve({ jwks_uri: "two" }));

            // act
            const result = await subject.getMetadata();

            // assert
            expect(result).toEqual({ issuer: "one", jwks_uri: "two" });
            const _metadata = subject["_metadata"]; // access private member
            expect(_metadata).toEqual({ issuer: "one", jwks_uri: "two" });
        });

        it("should fail if json call fails", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadataUrl: "http://sts/metadata"
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));
            const jsonService = subject["_jsonService"]; // access private member
            jest.spyOn(jsonService, "getJson").mockRejectedValue(new Error("test"));

            // act
            try {
                await subject.getMetadata();
                fail("should not come here");
            }
            catch (err) {
                expect(err).toBeInstanceOf(Error);
                expect((err as Error).message).toContain("test");
            }
        });
    });

    describe("getIssuer", () => {
        it("should return a promise", async () => {
            // act
            const p = subject.getIssuer();

            // assert
            expect(p).toBeInstanceOf(Promise);
            // eslint-disable-next-line no-empty
            try { await p; } catch {}
        });

        it("should use metadata on settings", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadata: {
                    issuer: "test"
                },
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));

            // act
            const result = await subject.getIssuer();

            // assert
            expect(result).toEqual("test");
        });

        it("should fail if no data on metadata", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadata: {
                }
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));

            // act
            try {
                await subject.getIssuer();
                fail("should not come here");
            }
            catch (err) {
                expect(err).toBeInstanceOf(Error);
                expect((err as Error).message).toContain("issuer");
            }
        });

        it("should fail if json call to load metadata fails", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadataUrl: "http://sts/metadata"
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));
            const jsonService = subject["_jsonService"]; // access private member
            jest.spyOn(jsonService, "getJson").mockRejectedValue(new Error("test"));

            // act
            try {
                await subject.getIssuer();
                fail("should not come here");
            }
            catch (err) {
                expect(err).toBeInstanceOf(Error);
                expect((err as Error).message).toContain("test");
            }
        });

        it("should return value from", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadata: {
                    issuer: "http://sts"
                }
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));

            // act
            const result = await subject.getIssuer();

            // assert
            expect(result).toEqual("http://sts");
        });

    });

    describe("getAuthorizationEndpoint", () => {

        it("should return value from metadata", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadata: {
                    authorization_endpoint: "http://sts/authorize"
                }
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));

            // act
            const result = await subject.getAuthorizationEndpoint();

            // assert
            expect(result).toEqual("http://sts/authorize");
        });

    });

    describe("getUserInfoEndpoint", () => {

        it("should return value from", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadata: {
                    userinfo_endpoint: "http://sts/userinfo"
                }
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));

            // act
            const result = await subject.getUserInfoEndpoint();

            // assert
            expect(result).toEqual("http://sts/userinfo");
        });

    });

    describe("getEndSessionEndpoint", () => {

        it("should return value from", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadata: {
                    end_session_endpoint: "http://sts/signout"
                }
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));

            // act
            const result = await subject.getEndSessionEndpoint();

            // assert
            expect(result).toEqual("http://sts/signout");
        });

        it("should support optional value", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadata: {
                }
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));

            // act
            const result = await subject.getEndSessionEndpoint();

            // assert
            expect(result).toBeUndefined();
        });

    });

    describe("getCheckSessionIframe", () => {

        it("should return value from", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadata: {
                    check_session_iframe: "http://sts/check_session"
                }
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));

            // act
            const result = await subject.getCheckSessionIframe();

            // assert
            expect(result).toEqual("http://sts/check_session");
        });

        it("should support optional value", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadata: {
                }
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));

            // act
            const result = await subject.getCheckSessionIframe();

            // assert
            expect(result).toBeUndefined();
        });

    });

    describe("getSigningKeys", () => {

        it("should return a promise", async () => {
            // act
            const p = subject.getSigningKeys();

            // assert
            expect(p).toBeInstanceOf(Promise);
            // eslint-disable-next-line no-empty
            try { await p; } catch {}
        });

        it("should use signingKeys on settings", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                signingKeys: [{ kid: "test" }]
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));

            // act
            const result = await subject.getSigningKeys();

            // assert
            expect(result).toEqual([{ kid: "test" }]);
        });

        it("should fail if metadata does not have jwks_uri", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadata: { issuer: "test" }
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));

            // act
            try {
                await subject.getSigningKeys();
                fail("should not come here");
            }
            catch (err) {
                expect(err).toBeInstanceOf(Error);
                expect((err as Error).message).toContain("jwks_uri");
            }
        });

        it("should fail if keys missing on keyset from jwks_uri", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadata: {
                    jwks_uri: "http://sts/metadata/keys"
                }
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));
            const jsonService = subject["_jsonService"]; // access private member
            jest.spyOn(jsonService, "getJson").mockImplementation(() => Promise.resolve({}));

            // act
            try {
                await subject.getSigningKeys();
                fail("should not come here");
            }
            catch (err) {
                expect(err).toBeInstanceOf(Error);
                expect((err as Error).message).toContain("keyset");
            }
        });

        it("should make json call to jwks_uri", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadata: {
                    jwks_uri: "http://sts/metadata/keys"
                }
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));
            const jsonService = subject["_jsonService"]; // access private member
            const json = {
                keys: [{
                    use:"sig",
                    kid:"test"
                }]
            };
            const getJsonMock = jest.spyOn(jsonService, "getJson")
                .mockImplementation(() => Promise.resolve(json));

            // act
            await subject.getSigningKeys();

            // assert
            expect(getJsonMock).toBeCalledWith("http://sts/metadata/keys");
        });

        it("should return keys from jwks_uri", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadata: {
                    jwks_uri: "http://sts/metadata/keys"
                }
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));
            const jsonService = subject["_jsonService"]; // access private member
            const expectedKeys = [{
                use:"sig",
                kid:"test"
            }];
            const json = {
                keys: expectedKeys
            };
            jest.spyOn(jsonService, "getJson").mockImplementation(() => Promise.resolve(json));

            // act
            const result = await subject.getSigningKeys();

            // assert
            expect(result).toEqual(expectedKeys);
        });

        it("should cache keys from json call", async () => {
            // arrange
            settings = {
                authority: "authority",
                client_id: "client",
                redirect_uri: "redirect",
                metadata: {
                    jwks_uri: "http://sts/metadata/keys"
                }
            };
            subject = new MetadataService(new OidcClientSettingsStore(settings));
            const jsonService = subject["_jsonService"]; // access private member
            const expectedKeys = [{
                use:"sig",
                kid:"test"
            }];
            const json = {
                keys: expectedKeys
            };
            jest.spyOn(jsonService, "getJson").mockImplementation(() => Promise.resolve(json));

            // act
            await subject.getSigningKeys();

            // assert
            const _signingKeys = subject["_signingKeys"]; // access private member
            expect(_signingKeys).toEqual(expectedKeys);
        });
    });
});
