import React from 'react';
import { One } from './One';

export const Two = ({ children }) => <One style={{margin: "5px", color: "red"}}>Two {children}</One>;
