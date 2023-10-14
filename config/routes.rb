# frozen_string_literal: true

Rails.application.routes.draw do
  root 'home#index'

  get 'sign-in', to: 'auth#sign_in'
  post 'sign-in', to: 'auth#sign_in_submit'
  post 'sign-out', to: 'auth#sign_out'
  get 'sign-out', to: redirect('/', status: 302)
end
