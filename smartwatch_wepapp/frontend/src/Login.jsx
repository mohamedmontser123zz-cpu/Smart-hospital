import React from 'react';
import './Login.css'

export default function Login(){
return (
    <div>
        <div className="logindiv">
            <div className="title"> Medex</div>
            <div className="loginform">
                <div className="formtitle">
                    Login
                </div>
                <form action="">
                    <label htmlFor="userName">UserName</label>
                    <input type="text" />
                    <label htmlFor="password">Password</label>
                    <input type="text" />
                    <div className="singupdiv">
                        <p>new accent</p>
                        <a href="">Sign up</a>
                    </div>
                    <button>Login</button>
                </form>
            </div>
        </div>
    </div>
)
}