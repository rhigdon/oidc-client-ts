// Copyright (c) Brock Allen & Dominick Baier. All rights reserved.
// Licensed under the Apache License, Version 2.0. See LICENSE in the project root for license information.

import { Logger, UrlUtils } from "./utils";
import { OidcClientSettings, OidcClientSettingsStore } from "./OidcClientSettings";
import { ResponseValidator } from "./ResponseValidator";
import { MetadataService } from "./MetadataService";
import { ErrorResponse } from "./ErrorResponse";
import { SigninRequest } from "./SigninRequest";
import { SigninResponse } from "./SigninResponse";
import { SignoutRequest, SignoutRequestArgs } from "./SignoutRequest";
import { SignoutResponse } from "./SignoutResponse";
import { SigninState } from "./SigninState";
import { State } from "./State";

/**
 * @public
 */
export interface CreateSigninRequestArgs {
    redirect_uri?: string;
    response_type?: string;
    scope?: string;

    /** custom "state", which can be used by a caller to have "data" round tripped */
    state?: unknown;

    prompt?: string;
    display?: string;
    max_age?: number;
    ui_locales?: string;
    id_token_hint?: string;
    login_hint?: string;
    acr_values?: string;
    resource?: string;
    response_mode?: "query" | "fragment";
    request?: string;
    request_uri?: string;
    extraQueryParams?: Record<string, string | number | boolean>;
    request_type?: string;
    client_secret?: string;
    extraTokenParams?: Record<string, unknown>;
    skipUserInfo?: boolean;
}

/**
 * @public
 */
export type CreateSignoutRequestArgs = Omit<SignoutRequestArgs, "url" | "state_data"> & { state?: unknown };

/**
 * Provides the raw OIDC/OAuth2 protocol support for the authorization endpoint and the end session endpoint in the
 * authorization server. It provides a bare-bones protocol implementation and is used by the UserManager class.
 * Only use this class if you simply want protocol support without the additional management features of the
 * UserManager class.
 *
 * @public
 */
export class OidcClient {
    public readonly settings: OidcClientSettingsStore;
    protected readonly _logger: Logger;

    public readonly metadataService: MetadataService;
    protected readonly _validator: ResponseValidator;

    public constructor(settings: OidcClientSettings) {
        this.settings = new OidcClientSettingsStore(settings);
        this._logger = new Logger("OidcClient");

        this.metadataService = new MetadataService(this.settings);
        this._validator = new ResponseValidator(this.settings, this.metadataService);
    }

    public async createSigninRequest({
        response_type, scope, redirect_uri,
        state,
        prompt, display, max_age, ui_locales, id_token_hint, login_hint, acr_values,
        resource, request, request_uri, response_mode, extraQueryParams, extraTokenParams, request_type, skipUserInfo
    }: CreateSigninRequestArgs): Promise<SigninRequest> {
        this._logger.debug("createSigninRequest");

        response_type = response_type || this.settings.response_type;
        scope = scope || this.settings.scope;
        redirect_uri = redirect_uri || this.settings.redirect_uri;

        // id_token_hint, login_hint aren't allowed on _settings
        prompt = prompt || this.settings.prompt;
        display = display || this.settings.display;
        max_age = max_age || this.settings.max_age;
        ui_locales = ui_locales || this.settings.ui_locales;
        acr_values = acr_values || this.settings.acr_values;
        resource = resource || this.settings.resource;
        response_mode = response_mode || this.settings.response_mode;
        extraQueryParams = extraQueryParams || this.settings.extraQueryParams;
        extraTokenParams = extraTokenParams || this.settings.extraTokenParams;

        if (response_type !== "code") {
            throw new Error("Only the Authorization Code flow (with PKCE) is supported");
        }

        const url = await this.metadataService.getAuthorizationEndpoint();
        this._logger.debug("createSigninRequest: Received authorization endpoint", url);

        const signinRequest = new SigninRequest({
            url,
            authority: this.settings.authority,
            client_id: this.settings.client_id,
            redirect_uri,
            response_type,
            scope,
            state_data: state,
            prompt, display, max_age, ui_locales, id_token_hint, login_hint, acr_values,
            resource, request, request_uri, extraQueryParams, extraTokenParams, request_type, response_mode,
            client_secret: this.settings.client_secret,
            skipUserInfo
        });

        const signinState = signinRequest.state;
        await this.settings.stateStore.set(signinState.id, signinState.toStorageString());
        return signinRequest;
    }

    public async readSigninResponseState(url: string, removeState = false): Promise<{ state: SigninState; response: SigninResponse }> {
        this._logger.debug("readSigninResponseState");

        const response = new SigninResponse(UrlUtils.readParams(url, this.settings.response_mode));
        const stateKey = response.state_id;
        if (!stateKey) {
            this._logger.error("readSigninResponseState: No state in response");
            throw new Error("No state in response");
        }

        const stateStore = this.settings.stateStore;
        const stateApi = removeState ? stateStore.remove.bind(stateStore) : stateStore.get.bind(stateStore);

        const storedStateString = await stateApi(stateKey);
        if (!storedStateString) {
            this._logger.error("readSigninResponseState: No matching state found in storage");
            throw new Error("No matching state found in storage");
        }

        const state = SigninState.fromStorageString(storedStateString);
        return { state, response };
    }

    public async processSigninResponse(url: string): Promise<SigninResponse> {
        this._logger.debug("processSigninResponse");

        const { state, response } = await this.readSigninResponseState(url, true);
        this._logger.debug("processSigninResponse: Received state from storage; validating response");
        return this._validator.validateSigninResponse(state, response);
    }

    public async createSignoutRequest({
        state,
        id_token_hint, post_logout_redirect_uri, extraQueryParams, request_type
    }: CreateSignoutRequestArgs = {}): Promise<SignoutRequest> {
        this._logger.debug("createSignoutRequest");

        post_logout_redirect_uri = post_logout_redirect_uri || this.settings.post_logout_redirect_uri;
        extraQueryParams = extraQueryParams || this.settings.extraQueryParams;

        const url = await this.metadataService.getEndSessionEndpoint();
        if (!url) {
            this._logger.error("createSignoutRequest: No end session endpoint url returned");
            throw new Error("no end session endpoint");
        }

        this._logger.debug("createSignoutRequest: Received end session endpoint", url);

        const request = new SignoutRequest({
            url,
            id_token_hint,
            post_logout_redirect_uri,
            state_data: state,
            extraQueryParams,
            request_type
        });

        const signoutState = request.state;
        if (signoutState) {
            this._logger.debug("createSignoutRequest: Signout request has state to persist");
            await this.settings.stateStore.set(signoutState.id, signoutState.toStorageString());
        }

        return request;
    }

    public async readSignoutResponseState(url: string, removeState = false): Promise<{ state: State | undefined; response: SignoutResponse }> {
        this._logger.debug("readSignoutResponseState");

        const response = new SignoutResponse(UrlUtils.readParams(url, this.settings.response_mode));
        const stateKey = response.state_id;
        if (!stateKey) {
            this._logger.debug("readSignoutResponseState: No state in response");

            if (response.error) {
                this._logger.warn("readSignoutResponseState: Response was error:", response.error);
                throw new ErrorResponse(response);
            }

            return { state: undefined, response };
        }

        const stateStore = this.settings.stateStore;

        const stateApi = removeState ? stateStore.remove.bind(stateStore) : stateStore.get.bind(stateStore);
        const storedStateString = await stateApi(stateKey);
        if (!storedStateString) {
            this._logger.error("readSignoutResponseState: No matching state found in storage");
            throw new Error("No matching state found in storage");
        }

        const state = State.fromStorageString(storedStateString);
        return { state, response };
    }

    public async processSignoutResponse(url: string): Promise<SignoutResponse> {
        this._logger.debug("processSignoutResponse");

        const { state, response } = await this.readSignoutResponseState(url, true);
        if (state) {
            this._logger.debug("processSignoutResponse: Received state from storage; validating response");
            return this._validator.validateSignoutResponse(state, response);
        }

        this._logger.debug("processSignoutResponse: No state from storage; skipping validating response");
        return response;
    }

    public clearStaleState(): Promise<void> {
        this._logger.debug("clearStaleState");
        return State.clearStaleState(this.settings.stateStore, this.settings.staleStateAgeInSeconds);
    }
}
