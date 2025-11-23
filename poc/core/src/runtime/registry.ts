import { Component } from './components.js';

export interface ComponentRegistry {
  [scheme: string]: Component;
}

export function createComponentRegistry(components: ComponentRegistry): ComponentRegistry {
  return components;
}
