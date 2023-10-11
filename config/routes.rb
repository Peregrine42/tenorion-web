# frozen_string_literal: true

Rails.application.routes.draw do
  root 'home#index'

  get 'sign-in', to: 'auth#sign_in'
  post 'sign-in', to: 'auth#sign_in_submit'
end
