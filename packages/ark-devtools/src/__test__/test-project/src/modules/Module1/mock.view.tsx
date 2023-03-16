import React from 'react';
// @ts-ignore
import pngImage from './assets/cover-art.png';
import './mock_style.scss';

/**
 * Test Component
 * @return {JSX.Element}
 */
export function TestComponent(): JSX.Element {
  return (
    <div>
      <img src={pngImage} />
    </div>
  );
}
